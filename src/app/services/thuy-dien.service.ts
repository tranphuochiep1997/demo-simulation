import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ThongKeThuyDien } from '../models/thong-ke-thuy-dien';

@Injectable({
  providedIn: 'root',
})
export class ThuyDienService {
  constructor(private http: HttpClient) { }

  getData(): Observable<ThongKeThuyDien[]> {
    return this.http.get<ThongKeThuyDien[]>('/baocaothuydien_thongke.json'); // Replace with your API endpoint
  }
}
