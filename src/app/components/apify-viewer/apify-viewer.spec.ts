import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApifyViewer } from './apify-viewer';

describe('ApifyViewer', () => {
  let component: ApifyViewer;
  let fixture: ComponentFixture<ApifyViewer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ApifyViewer],
    }).compileComponents();

    fixture = TestBed.createComponent(ApifyViewer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
