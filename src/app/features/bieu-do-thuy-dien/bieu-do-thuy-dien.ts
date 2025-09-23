import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import * as echarts from 'echarts';
import { ThuyDienService } from '../../services/thuy-dien.service';

@Component({
  selector: 'app-bieu-do-thuy-dien',
  imports: [],
  templateUrl: './bieu-do-thuy-dien.html',
  styleUrl: './bieu-do-thuy-dien.scss'
})
export class BieuDoThuyDien implements OnInit {
  @ViewChild('main', { static: true }) domRef!: ElementRef;
  myChart!: echarts.ECharts;
  mucNuocHienTai: number = 0;
  phanTramTheTich: number = 0;
  theTichToiDaSongTranh2: number = 795.6;

  constructor(private thuyDienService: ThuyDienService, private cdr: ChangeDetectorRef) {
    this.updateWaterHeight = this.updateWaterHeight.bind(this);
  }

  ngOnInit(): void {
    this.myChart = echarts.init(this.domRef.nativeElement);
    // ----- your H-W data: [volume, height] sorted by height ascending -----
    // const hwData = [
    //   [24.26,110],
    //   [63.64,120],
    //   [123.36,130],
    //   [225.96,140],
    //   [379.03,150],
    //   [568.03,160],
    //   [770.86,170],
    //   [852.23,175]
    // ];
    const hwData: number[][] = [];
    for (let i = 110; i <= 180; i++) {
      hwData.push([this.calVolumeByHeightSongTranh(i) || 0, i]);
    }
    this.thuyDienService.getData().subscribe(response => {
      const currentHour = new Date().getHours();
      console.log({currentHour});
      let viTriGioTrongResponse = response.findIndex(val => val.gio === `${String(currentHour).padStart(2, '0')}:00`);
      console.log({viTriGioTrongResponse});
      // Height to fill up to (current water level). If you want the whole curve, set to max height.
      let mucnuoc = response[viTriGioTrongResponse].htl4;
      this.updateWaterHeight(hwData, mucnuoc);

      // Hen gio chay cho gio tiep theo
      const now = new Date();
      const nextHour = new Date(now);
      nextHour.setHours(now.getHours() + 1, 0, 1, 0); // hour + 1, at second 1

      const delay = nextHour.getTime() - now.getTime();

      setTimeout(() => {
        viTriGioTrongResponse += 1;
        mucnuoc = response[viTriGioTrongResponse].htl4;
        this.updateWaterHeight(hwData, mucnuoc); // first call at HH:00:01
        // repeat every 1 hour
        setInterval(() => {
          viTriGioTrongResponse += 1;
          const mucnuoc = response[viTriGioTrongResponse].htl4;
          this.updateWaterHeight(hwData, mucnuoc); // first call at HH:00:01
        }, 3600 * 1000);

      }, delay);
    })
  }

  calVolumeByHeightSongTranh(mucnuoc: number) {
    const ranges = [
      { min: 110, max: 120, a: 0.093,  b: -17.281, c: 800.6 },
      { min: 120, max: 130, a: 0.1036, b: -19.87,  c: 958.64 },
      { min: 130, max: 140, a: 0.109,  b: -21.271, c: 1049.5 },
      { min: 140, max: 150, a: 0.145,  b: -31.451, c: 1769.1 },
      { min: 150, max: 160, a: 0.1676, b: -38.102, c: 2258.3 },
      { min: 160, max: 170, a: 0.1942, b: -46.653, c: 2945.5 },
      { min: 170, max: 180, a: 0.212,  b: -52.678, c: 3455.3 }
    ];

    for (const r of ranges) {
      if (mucnuoc >= r.min && mucnuoc <= r.max) {
        return Math.round((r.a * Math.pow(mucnuoc, 2) + r.b * mucnuoc + r.c) * 100) / 100;
      }
    }

    // out of range
    console.warn("Muc nuoc khong hop ly");
    return null;
  }

  updateWaterHeight(hwData: number[][], fillToHeight: number) {
    this.mucNuocHienTai = fillToHeight;
    const theTichHienTai = this.calVolumeByHeightSongTranh(this.mucNuocHienTai) || 0;
    this.phanTramTheTich = Math.round(theTichHienTai / this.theTichToiDaSongTranh2 * 10000) / 100;

    const polygonData = this.buildFillPolygon(hwData, fillToHeight);
    const fillPoint = this.computeFillPoint(hwData, fillToHeight);
    // Build option
    const option = {
      title: {
        text: 'Hồ Sông Tranh 2',
        // subtext: 'Dam simulation',
        left: 'center',
        textStyle: {
          color: '#fff',
          fontSize: 18
        },
        subtextStyle: {
          color: '#aaa'
        }
      },
      backgroundColor: '#0B1739',
      tooltip: {
        trigger: 'axis',   // important: aligns tooltip with axis
        axisPointer: {
          type: 'cross',   // show crosshair (horizontal + vertical)
          label: {
            backgroundColor: '#6a7985'
          }
        },
        formatter: function(params: any) {
          // show volume & height on tooltip
          let txt = '';
          params.forEach(function(p: any){
            if (p.seriesName === 'Curve') {
              txt += 'W: ' + p.value[0] + '<br/>H: ' + p.value[1];
            }
          });
          return txt;
        }
      },
      grid: { left: 80, right: 80, top: 50, bottom: 60 },
      xAxis: {
        type: 'value',
        name: 'W (triệu m³)',
        min: 0,
        max: Math.max.apply(null, hwData.map(d => d[0])) * 1.05,
        axisLine: { lineStyle: { color: '#999' } },
        axisLabel: { color: '#bbb' },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } }
      },
      yAxis: {
        type: 'value',
        name: 'H (m)',
        min: hwData[0][1],
        max: hwData[hwData.length-1][1],
        axisLine: { lineStyle: { color: '#999' } },
        axisLabel: { color: '#bbb' },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } }
      },
      series: [
        // custom polygon fill (drawn first, behind the curve)
        {
          type: 'custom',
          name: 'FillToY',
          renderItem: function (params: any, api: any) {
            // convert polygon data coords -> pixel coordinates
            const points = polygonData.map(function(p){ return api.coord(p); });
            // discard if not valid or off-chart
            if (!points || points.length < 3) return null;
            return {
              type: 'polygon',
              shape: {
                points: points
              },
              style: api.style({
                fill: 'rgba(133, 113, 244, 0.6)', // change fill color/alpha
                stroke: null
              }),
              z: 1
            };
          },
          data: [0] // one item so renderItem runs once
        },

        // the smooth resistor curve on top
        {
          name: 'Curve',
          type: 'line',
          smooth: true,
          data: hwData,
          encode: { x: 0, y: 1 }, // our data is [volume, height]
          lineStyle: { width: 3, color: '#e056fd' },
          symbol: 'none',
          // symbolSize: 7,
          // showAllSymbol: true,
          // itemStyle: { color: '#e056fd' },
          z: 2,
          markPoint: {
            data: [{
              coord: [theTichHienTai, this.mucNuocHienTai],
              value: Math.round(fillPoint[0])
            }],
            symbol: 'circle',
            symbolSize: 11,
            itemStyle: {
              color: '#000',         // inside black
              borderColor: '#e056fd', // pink border (same as line)
              borderWidth: 2.5
            },
            label: { show: false } // no text label
          }
        }
      ]
    };

    this.myChart.setOption(option);
    this.cdr.detectChanges(); // or this.cdr.markForCheck();
  }

  // Find polygon points (interpolate if fillToHeight lies between two sample points)
  buildFillPolygon(hw: number[][], fillH: number) {
    if (!hw || hw.length === 0) return [];

    const poly = [];
    poly.push([0, hw[0][1]]);

    for (let i = 0; i < hw.length; i++) {
      const x = hw[i][0], y = hw[i][1];
      if (y <= fillH) {
        poly.push([x, y]);
      } else {
        if (i > 0) {
          const x0 = hw[i-1][0], y0 = hw[i-1][1];
          const x1 = x, y1 = y;
          const t = (fillH - y0) / (y1 - y0);
          const interpX = x0 + t * (x1 - x0);
          poly.push([interpX, fillH]);
        } else {
          poly.push([0, fillH]);
        }
        break;
      }
    }

    const topY = poly[poly.length-1][1];
    poly.push([0, topY]);
    return poly;
  }

  // compute the markPoint coordinate (interpolate at fillToHeight)
  computeFillPoint(hw: number[][], fillH: number) {
    let pt = null;
    for (let i = 0; i < hw.length; i++) {
      if (hw[i][1] === fillH) { pt = hw[i]; break; }
      if (hw[i][1] > fillH) {
        const x0 = hw[i-1][0], y0 = hw[i-1][1];
        const x1 = hw[i][0], y1 = hw[i][1];
        const t = (fillH - y0) / (y1 - y0);
        const xi = x0 + t * (x1 - x0);
        pt = [xi, fillH];
        break;
      }
    }
    if (!pt) pt = hw[hw.length - 1];
    return pt;
  }
}
