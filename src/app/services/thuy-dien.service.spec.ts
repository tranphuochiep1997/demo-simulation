import { TestBed } from '@angular/core/testing';

import { ThuyDienService } from './thuy-dien.service';

describe('ThuyDienService', () => {
  let service: ThuyDienService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ThuyDienService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
