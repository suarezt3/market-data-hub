// supabase/functions/apify-runner/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { ApifyClient } from "npm:apify-client@^2.8.3";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    const { action = 'run', actorId, inputPayload, runId, country, startDate, endDate } = body;

    // FIX: Agregamos 'update-run' a las acciones que no necesitan actorId obligatorio
    if (!actorId && action !== 'list-runs' && action !== 'get-run-data' && action !== 'update-run') {
      throw new Error('Bad Request: El parámetro actorId es obligatorio.');
    }

    const apifyToken = Deno.env.get('APIFY_API_TOKEN');
    if (!apifyToken) throw new Error('Configuración: APIFY_API_TOKEN no está definido.');

    // INSTANCIAMOS SUPABASE PARA LA METADATA
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const client = new ApifyClient({ token: apifyToken });
    let responseData: any = [];
    let returnedRunId = null;

    if (action === 'run') {
      console.log(`[Apify Runner] Iniciando NUEVA ejecución del actor: ${actorId}`);
      const run = await client.actor(actorId).call(inputPayload);
      returnedRunId = run.id;

      if (country || startDate || endDate) {
        const { error: dbError } = await supabase
          .from('apify_run_metadata')
          .insert([{
            run_id: run.id,
            country: country || 'Colombia',
            start_date: startDate,
            end_date: endDate
          }]);

        if (dbError) {
          console.warn('[Supabase Warning] No se pudo guardar la metadata:', dbError.message);
        }
      }

      const dataset = await client.dataset(run.defaultDatasetId).listItems();
      responseData = dataset.items;

    } else if (action === 'get-latest') {
      console.log(`[Apify Runner] Buscando último historial para: ${actorId}`);
      const runs = await client.actor(actorId).runs().list({ limit: 1, desc: true, status: 'SUCCEEDED' });
      if (runs.items.length === 0) throw new Error('No hay datos históricos exitosos para este Actor.');

      returnedRunId = runs.items[0].id;
      const dataset = await client.dataset(runs.items[0].defaultDatasetId).listItems();
      responseData = dataset.items;

    } else if (action === 'list-runs') {
      console.log(`[Apify Runner] Listando historial global y cruzando con base de datos...`);
      const runs = await client.runs().list({ limit: 15, desc: true });

      const runIds = runs.items.map(r => r.id);

      const { data: metaData } = await supabase
        .from('apify_run_metadata')
        .select('run_id, country, start_date, end_date')
        .in('run_id', runIds);

      const metaMap = (metaData || []).reduce((acc: any, curr: any) => {
        acc[curr.run_id] = curr;
        return acc;
      }, {});

      responseData = runs.items.map(r => {
        const meta = metaMap[r.id];
        return {
          id: r.id,
          status: r.status,
          startedAt: r.startedAt,
          finishedAt: r.finishedAt,
          usageTotalUsd: r.usageTotalUsd || 0,
          actorId: r.actId,
          country: meta?.country || 'Colombia',
          inputStartDate: meta?.start_date,
          inputEndDate: meta?.end_date
        };
      });

    } else if (action === 'get-run-data') {
      if (!runId) throw new Error('El parámetro runId es obligatorio.');
      console.log(`[Apify Runner] Obteniendo dataset del Run ID: ${runId}`);

      const runInfo = await client.run(runId).get();
      if (!runInfo) throw new Error('Historial (Run) no encontrado.');
      returnedRunId = runInfo.id;

      const dataset = await client.dataset(runInfo.defaultDatasetId).listItems();
      responseData = dataset.items;

    // ==========================================
    // NUEVA ACCIÓN: ACTUALIZAR METADATA
    // ==========================================
    } else if (action === 'update-run') {
      if (!runId || !country) throw new Error('Los parámetros runId y country son obligatorios para actualizar.');
      console.log(`[Apify Runner] Actualizando metadata del Run ID: ${runId} a mercado: ${country}`);

      // UPSERT: Si el run ya tiene metadata, actualiza el país. Si es un run programado automático (nuevo), lo inserta.
      // IMPORTANTE: Asegúrate de que 'run_id' esté marcado como Primary Key o Unique en Supabase para que onConflict funcione.
      const { error: dbError } = await supabase
        .from('apify_run_metadata')
        .upsert(
          { run_id: runId, country: country },
          { onConflict: 'run_id' }
        );

      if (dbError) {
        console.error('[Supabase Error] Fallo al actualizar metadata:', dbError.message);
        throw new Error(`Error en base de datos: ${dbError.message}`);
      }

      returnedRunId = runId;
      responseData = []; // No necesitamos retornar el dataset, solo el status 200

    } else {
      throw new Error('Acción no soportada por la Edge Function.');
    }

    return new Response(
      JSON.stringify({ success: true, data: responseData, runId: returnedRunId, action: action }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error interno desconocido';
    console.error('[Apify Runner] Error:', errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
