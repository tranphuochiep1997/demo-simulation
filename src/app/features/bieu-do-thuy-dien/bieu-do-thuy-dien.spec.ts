import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BieuDoThuyDien } from './bieu-do-thuy-dien';

describe('BieuDoThuyDien', () => {
  let component: BieuDoThuyDien;
  let fixture: ComponentFixture<BieuDoThuyDien>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BieuDoThuyDien]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BieuDoThuyDien);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
