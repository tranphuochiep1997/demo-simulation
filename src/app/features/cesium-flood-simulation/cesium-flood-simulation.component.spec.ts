import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CesiumViewerComponent } from './cesium-viewer.component';

describe('CesiumViewerComponent', () => {
  let component: CesiumViewerComponent;
  let fixture: ComponentFixture<CesiumViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CesiumViewerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CesiumViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
