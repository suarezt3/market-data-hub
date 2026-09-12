// supabase/functions/apify-runner/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { ApifyClient } from "npm:apify-client@^2.8.3";

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
    const { action = 'run', actorId, inputPayload, runId } = body;

    // Relajamos la validación para que 'list-runs' pueda ejecutarse de forma global
    if (!actorId && action !== 'list-runs' && action !== 'get-run-data') {
      throw new Error('Bad Request: El parámetro actorId es obligatorio.');
    }

    const apifyToken = Deno.env.get('APIFY_API_TOKEN');
    if (!apifyToken) throw new Error('Configuración del Servidor: APIFY_API_TOKEN no está definido.');

    const client = new ApifyClient({ token: apifyToken });
    let responseData: any = [];
    let returnedRunId = null;

    if (action === 'run') {
      console.log(`[Apify Runner] Iniciando NUEVA ejecución del actor: ${actorId}`);
      const run = await client.actor(actorId).call(inputPayload);
      returnedRunId = run.id;
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
      // CAMBIO CLAVE: Consultamos client.runs() globalmente, no atado a un actorId específico
      console.log(`[Apify Runner] Listando historial global de la cuenta (Top 15)`);
      const runs = await client.runs().list({ limit: 15, desc: true });

      responseData = runs.items.map(r => ({
        id: r.id,
        status: r.status,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        usageTotalUsd: r.usageTotalUsd || 0,
        actorId: r.actId // NUEVO: Extraemos el ID del actor para que Angular sepa de qué red social es
      }));

    } else if (action === 'get-run-data') {
      if (!runId) throw new Error('El parámetro runId es obligatorio.');
      console.log(`[Apify Runner] Obteniendo dataset del Run ID: ${runId}`);

      const runInfo = await client.run(runId).get();
      if (!runInfo) throw new Error('Historial (Run) no encontrado.');
      returnedRunId = runInfo.id;

      const dataset = await client.dataset(runInfo.defaultDatasetId).listItems();
      responseData = dataset.items;

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
