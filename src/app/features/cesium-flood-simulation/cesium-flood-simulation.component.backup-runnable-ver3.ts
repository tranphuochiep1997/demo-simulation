import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { 
  Cartesian3, 
  createOsmBuildingsAsync, 
  Ion, 
  Math as CesiumMath, 
  Terrain, 
  Viewer, 
  Model, 
  Transforms,
  ModelAnimationLoop,
  SampledProperty,
  Matrix3,
  SampledPositionProperty,
  VelocityVectorProperty,
  Matrix4,
  JulianDate,
  ClockRange,
  VelocityOrientationProperty,
  DistanceDisplayCondition,
} from 'cesium';
import * as Cesium from 'cesium';

type FloodSimOption = {
  centerLon?: number;
  centerLat?: number; 
  gridSize?: number;
  degreesPerCell?: number;
  sampleTerrainLevelFallback?: number;
  rainfall_mm_per_24h: number;
  drainage_mm_per_hour: number;
  flowK?: number;
  maxSimSubSteps?: number;
  maxDisplayDepth?: number;
  simSpeed?: number;
}

@Component({
  selector: 'app-cesium-flood-simulation',
  imports: [],
  standalone: true,
  templateUrl: './cesium-flood-simulation.component.html',
  styleUrl: './cesium-flood-simulation.component.scss'
})
export class CesiumFloodSimulationComponent implements OnInit {
  @ViewChild('cesiumContainer', { static: true }) cesiumContainer!: ElementRef;

  async ngOnInit() {
    Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2OWRjNDZjZi1hOTMwLTQzMGYtYTJiOS05MjVmMGM5MTZmMmIiLCJpZCI6MzA2NjUwLCJpYXQiOjE3NDgzMzQzMTl9.i7Fkt8f5lxgAt-6jInFQ8rRYDUClRLTbQbAbTQAek7I';
    // Initialize the Cesium Viewer in the HTML element with the `cesiumContainer` ID.
    const viewer = new Viewer(this.cesiumContainer.nativeElement, {
      terrainProvider: await Cesium.createWorldTerrainAsync({
        requestWaterMask: true,  // Enable water mask for better integration
        requestVertexNormals: true
      }),
    });    
    const centerLon = 106.70002399070714;
    const centerLat = 10.761931120498742;
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(centerLon, centerLat, 180),
      // destination: Cartesian3.fromDegrees(105.78104413658636, 21.043793888939884, 30),
      orientation: {
        heading: CesiumMath.toRadians(0.0),
        pitch: CesiumMath.toRadians(-15.0)
      }
    });
    // Add Cesium OSM Buildings, a global 3D buildings layer.
    const buildingTileset = await createOsmBuildingsAsync();
    viewer.scene.primitives.add(buildingTileset);  

    // startFloodSim(viewer, options)
    // options: { centerLon, centerLat, gridSize, degreesPerCell, sampleTerrainLevelFallback }
    async function startFloodSim(viewer: Viewer, options: FloodSimOption) {
      // ----- Config & defaults -----
      const centerLon = options.centerLon ?? 106.70002399070714;
      const centerLat = options.centerLat ?? 10.761931120498742;
      const gridSize = options.gridSize ?? 100; // cells per side
      const degreesPerCell = options.degreesPerCell ?? 0.0005;
      const sampleTerrainLevelFallback = options.sampleTerrainLevelFallback ?? 11;
      const simSpeed = options.simSpeed ?? 60; // tốc độ mô phỏng (1 giây thật = 60 giây mô phỏng)

      // Simulation params (user inputs)
      // rainfall is provided as mm per 24h initially; convert to mm/hour inside.
      let rainfall_mm_per_24h = options.rainfall_mm_per_24h ?? 50; // mm in 24h (default)
      let drainage_mm_per_hour = options.drainage_mm_per_hour ?? 1; // mm/h

      // Flow tuning
      const flowK = options.flowK ?? 0.6;
      const maxSimSubSteps = options.maxSimSubSteps ?? 4;

      // visualization
      let maxDisplayDepth = options.maxDisplayDepth ?? 0.2; // meters mapped to darkest blue

      // ----- internal derived -----
      const rainfall_mm_per_hour = () => rainfall_mm_per_24h / 24.0;
      const mmh_to_m_per_s = (mmh: number) => (mmh / 1000.0) / 3600.0;

      const cells = gridSize * gridSize;
      const vertsPerSide = gridSize + 1;

      // ----- arrays: terrain per cell center, waterDepth per cell -----
      const terrainCellHeights = new Float32Array(cells); // sampled at cell centers (meters)
      const waterDepth = new Float32Array(cells).fill(0.0); // meters

      // Build lon/lat arrays for cell centers
      const lonCell = new Array(gridSize);
      const latCell = new Array(gridSize);
      const half = gridSize / 2;
      for (let i = 0; i < gridSize; i++) {
        lonCell[i] = centerLon + (i - half) * degreesPerCell;
        latCell[i] = centerLat + (i - half) * degreesPerCell;
      }

      // Build cartographic list for sampling cell centers
      const cartos = [];
      for (let j = 0; j < gridSize; j++) {
        for (let i = 0; i < gridSize; i++) {
          cartos.push(Cesium.Cartographic.fromDegrees(lonCell[i], latCell[j], 0));
        }
      }

      // Sample terrain heights for each cell center
      try {
        const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, cartos);
        sampled.forEach((c, idx) => (terrainCellHeights[idx] = c.height || 0));
      } catch (err) {
        console.warn("sampleTerrainMostDetailed failed, falling back to sampleTerrain", err);
        const sampled = await Cesium.sampleTerrain(viewer.terrainProvider, sampleTerrainLevelFallback, cartos);
        sampled.forEach((c, idx) => (terrainCellHeights[idx] = c.height || 0));
      }

      // Rectangle bounds (cover the whole grid)
      const west = lonCell[0] - degreesPerCell * 0.5;
      const east = lonCell[gridSize - 1] + degreesPerCell * 0.5;
      const south = latCell[0] - degreesPerCell * 0.5;
      const north = latCell[gridSize - 1] + degreesPerCell * 0.5;
      const rectangle = Cesium.Rectangle.fromDegrees(west, south, east, north);

      // Compute an average terrain height in the sampled cell centers for base rectangle elevation
      let sumH = 0;
      for (let i = 0; i < cells; i++) sumH += terrainCellHeights[i];
      const avgTerrain = cells > 0 ? sumH / cells : 0;
      const baseHeight = avgTerrain; // we'll place depth mask slightly above this to avoid z-fight

      // ----- depthCanvas: gridSize x gridSize, each pixel maps to a cell -----
      const depthCanvas = document.createElement("canvas");
      depthCanvas.width = gridSize;
      depthCanvas.height = gridSize;
      const depthCtx = depthCanvas.getContext("2d", { alpha: true });
      (depthCtx as any).imageSmoothingEnabled = false;

      // Initially clear
      depthCtx?.clearRect(0, 0, gridSize, gridSize);

      // ----- Build two rectangles (depth mask + water waves) -----
      // Depth mask rectangle (shows blue intensity according to waterDepth)
      const depthGeom = new Cesium.RectangleGeometry({
        rectangle: rectangle,
        height: baseHeight + 0.02, // tiny offset above terrain
        // use textured vertex format so Material 'Image' can map the canvas
        vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
      });

      const depthMaterial = new Cesium.Material({
        fabric: {
          type: "Image",
          uniforms: {
            image: depthCanvas,
          },
        },
      });

      const depthAppearance = new Cesium.MaterialAppearance({
        material: depthMaterial,
        translucent: true,
      });

      const depthPrimitive = new Cesium.Primitive({
        geometryInstances: new Cesium.GeometryInstance({ geometry: depthGeom }),
        appearance: depthAppearance,
        asynchronous: false,
      });

      // Water wave rectangle (on top) using built-in Water material for animated waves:
      // place slightly above depthPrimitive so waves render on top
      // const waveGeom = new Cesium.RectangleGeometry({
      //   rectangle: rectangle,
      //   height: baseHeight + 0.05, // slightly above depth mask
      //   vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
      // });

      // let waterWaveMaterial = new Cesium.Material({
      //   fabric: {
      //     type: "Water",
      //     uniforms: {
      //       baseWaterColor: new Cesium.Color(0.0, 0.3, 0.6, 0.5),
      //       blendColor: new Cesium.Color(0.0, 0.5, 0.7, 0.3),
      //       specularMap: Cesium.buildModuleUrl("Assets/Textures/waterNormals.jpg"),
      //       normalMap: Cesium.buildModuleUrl("Assets/Textures/waterNormals.jpg"),
      //       frequency: 8000.0,
      //       animationSpeed: 0.02,
      //       amplitude: 0.5,
      //     },
      //   },
      // });

      // const waveAppearance = new Cesium.MaterialAppearance({
      //   material: waterWaveMaterial,
      //   translucent: true,
      // });

      // const waterPrimitive = new Cesium.Primitive({
      //   geometryInstances: new Cesium.GeometryInstance({ geometry: waveGeom }),
      //   appearance: waveAppearance,
      //   asynchronous: false,
      // });

      // Add primitives to scene
      viewer.scene.primitives.add(depthPrimitive);
      // viewer.scene.primitives.add(waterPrimitive);

      // Ensure depth-test against terrain so water is occluded correctly by terrain/buildings as needed
      viewer.scene.globe.depthTestAgainstTerrain = true;

      // Small initial pulse for visibility
      waterDepth[Math.floor(cells / 2)] = 0.5;

      // ----- Simple hydraulic sim: rainfall -> flow -> drainage -----
      function avgCellHeight(ci: number, cj: number) {
        // return sampled terrain cell center height (we already sampled per cell)
        return terrainCellHeights[cj * gridSize + ci] || 0;
      }

      function simStep(dtSeconds: number) {
        if (dtSeconds <= 0) return;
        // nhân tốc độ mô phỏng
        const simDt = dtSeconds * simSpeed;

        // rainfall input: user gives mm per 24h, convert to mm/h -> then m/s for dt
        const rain_m = mmh_to_m_per_s(rainfall_mm_per_hour()) * simDt;
        const drain_m = mmh_to_m_per_s(drainage_mm_per_hour) * simDt;

        // 1) add rainfall
        for (let c = 0; c < cells; c++) {
          waterDepth[c] += rain_m;
        }

        // 2) compute flows
        const out = new Float32Array(cells);
        const incoming = new Float32Array(cells);

        for (let j = 0; j < gridSize; j++) {
          for (let i = 0; i < gridSize; i++) {
            const id = j * gridSize + i;
            const H = avgCellHeight(i, j) + waterDepth[id];

            // neighbors (4-connected)
            const neighbors = [];
            if (i > 0) neighbors.push(id - 1);
            if (i < gridSize - 1) neighbors.push(id + 1);
            if (j > 0) neighbors.push(id - gridSize);
            if (j < gridSize - 1) neighbors.push(id + gridSize);

            let totalPotential = 0;
            const potentials = new Array(neighbors.length);
            for (let n = 0; n < neighbors.length; n++) {
              const nb = neighbors[n];
              const nb_i = nb % gridSize;
              const nb_j = Math.floor(nb / gridSize);
              const Hn = avgCellHeight(nb_i, nb_j) + waterDepth[nb];
              const dh = H - Hn;
              const pot = dh > 0 ? flowK * dh : 0;
              potentials[n] = pot;
              totalPotential += pot;
            }

            if (totalPotential <= 0) continue;
            const maxOut = Math.min(waterDepth[id], totalPotential * dtSeconds);
            if (maxOut <= 0) continue;

            for (let n = 0; n < neighbors.length; n++) {
              const nb = neighbors[n];
              const share = potentials[n] / totalPotential;
              const amount = share * maxOut;
              out[id] += amount;
              incoming[nb] += amount;
            }
          }
        }

        // 3) apply flows
        for (let c = 0; c < cells; c++) {
          waterDepth[c] = Math.max(0, waterDepth[c] - out[c] + incoming[c]);
        }

        // 4) apply drainage (after flows)
        if (drain_m > 0) {
          for (let c = 0; c < cells; c++) {
            waterDepth[c] = Math.max(0, waterDepth[c] - drain_m);
          }
        }
      }

      // ----- draw depth canvas where each pixel = one cell -----
      function drawDepthCanvas() {
        const imageData = depthCtx?.createImageData(gridSize, gridSize);
        if (!imageData) return;
        const data = imageData.data;

        for (let j = 0; j < gridSize; j++) {
          for (let i = 0; i < gridSize; i++) {
            const idx = j * gridSize + i;
            // depth mapping: 0..1
            let d = waterDepth[idx] / maxDisplayDepth;
            d = Math.max(0, Math.min(1, d));
            // color gradient (light -> dark blue)
            const r = Math.round((1 - d) * 120 + d * 0);
            const g = Math.round((1 - d) * 200 + d * 50);
            const b = Math.round((1 - d) * 255 + d * 180);
            // alpha: stronger for deeper water; keep no less than 0.25
            const alpha = Math.round((0.25 + 0.75 * d) * 255);

            const i4 = idx * 4;
            data[i4 + 0] = r;
            data[i4 + 1] = g;
            data[i4 + 2] = b;
            data[i4 + 3] = alpha;
          }
        }
        depthCtx?.putImageData(imageData, 0, 0);
      }

      // function updateWaterColor(avgDepth: number, maxDisplayDepth: number) {
      //   const green = 0.25 + Math.min(0.4, (avgDepth / maxDisplayDepth) * 0.8);

      //   // Tạo lại material với uniform mới
      //   const normalMapUrl = Cesium.buildModuleUrl("Assets/Textures/waterNormals.jpg"); // Cesium asset (exists in cesium releases)
      //   waterWaveMaterial = new Cesium.Material({
      //     fabric: {
      //       type: "Water",
      //       uniforms: {
      //         baseWaterColor: new Cesium.Color(0.02, green, 0.6, 0.6),
      //         blendColor: new Cesium.Color(0.0, 0.5, 0.7, 0.3),
      //         specularMap: normalMapUrl,
      //         normalMap: normalMapUrl,
      //         frequency: 8000.0,
      //         animationSpeed: 0.02,
      //         amplitude: 0.5,
      //       },
      //     },
      //   });

      //   // Cập nhật lại appearance.material
      //   waterPrimitive.appearance.material = waterWaveMaterial;
      // }

      // ----- main loop (preRender) -----
      let lastTime = performance.now() / 1000;
      viewer.scene.preRender.addEventListener(() => {
        const now = performance.now() / 1000;
        let dt = now - lastTime;
        if (dt <= 0) return;
        if (dt > 1.0) dt = 1.0;
        lastTime = now;

        // substeps for stability
        const subSteps = Math.max(1, Math.min(maxSimSubSteps, Math.ceil(dt / 0.2)));
        const subDt = dt / subSteps;
        for (let s = 0; s < subSteps; s++) {
          simStep(subDt);
        }

        // update depth canvas and set as material image
        drawDepthCanvas();
        depthMaterial.uniforms.image = depthCanvas;
      });

      // ----- control helpers for external use -----
      window.setRainfall24h = (v: number) => {
        rainfall_mm_per_24h = +v;
        console.log("rainfall_mm_per_24h =", rainfall_mm_per_24h);
      };
      window.setDrainage_mm_per_hour = (v: number) => {
        drainage_mm_per_hour = +v;
        console.log("drainage_mm_per_hour =", drainage_mm_per_hour);
      };
      window.addWaterPulse = (lon: number, lat: number, radiusMeters: number, depthMeters: number) => {
        // simple radial pulse into nearest cells
        const lon0 = lonCell[0] - 0.5 * degreesPerCell;
        const lat0 = latCell[0] - 0.5 * degreesPerCell;
        const lonIdx = Math.round((lon - lon0) / degreesPerCell);
        const latIdx = Math.round((lat - lat0) / degreesPerCell);
        for (let j = 0; j < gridSize; j++) {
          for (let i = 0; i < gridSize; i++) {
            const idx = j * gridSize + i;
            const dx = (i - lonIdx) * degreesPerCell * 111320 * Math.cos(centerLat * Math.PI / 180);
            const dy = (j - latIdx) * degreesPerCell * 110540;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d <= radiusMeters) {
              waterDepth[idx] += depthMeters * (1 - d / radiusMeters);
            }
          }
        }
      };

      console.log("Flood sim started (rectangle + waves). Controls: setRainfall24h(v), setDrainage_mm_per_hour(v), addWaterPulse(lon,lat,r_m,depth_m)");
    }

    // USAGE: after you create 'viewer'
    startFloodSim(viewer, { 
      centerLon, 
      centerLat, 
      gridSize: 100, 
      rainfall_mm_per_24h: 50000, 
      drainage_mm_per_hour: 0,
      simSpeed: 300
    });
  }
}
