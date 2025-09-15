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
    const tarrain = Terrain.fromWorldTerrain();
    const viewer = new Viewer(this.cesiumContainer.nativeElement, {
      shouldAnimate: true,
      // terrain: Terrain.fromWorldTerrain(),
      terrainProvider: tarrain.provider
    });    

    // Fly the camera to San Francisco at the given longitude, latitude, and height.
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(106.70036850524059, 10.754358093758299, 180),
      // destination: Cartesian3.fromDegrees(105.78104413658636, 21.043793888939884, 30),
      orientation: {
        heading: CesiumMath.toRadians(0.0),
        pitch: CesiumMath.toRadians(-15.0)
      }
    });
    // Add Cesium OSM Buildings, a global 3D buildings layer.
    const buildingTileset = await createOsmBuildingsAsync();
    viewer.scene.primitives.add(buildingTileset);  


    //=====================================Flood simulation=======================================
    // Flood-sim example for CesiumJS
    // - Requires an existing Cesium viewer: `viewer`
    // - Samples terrain elevations for grid points, runs simple cellular flow,
    //   and draws a dynamic water mesh.

    (async function() {
      // CONFIG
      const GRID_W = 80;           // columns
      const GRID_H = 60;           // rows
      const cellSizeMeters = 20;   // approx meters per cell (square)
      const dt = 2.0;              // simulation timestep in seconds
      const flowK = 0.7;           // flow coefficient (m/s per m head)
      let rainfall_mm_per_hour = 30; // user input: mm/hour
      let drainage_mm_per_hour = 5;  // user drain/percolation mm/hour

      // Convert rainfall & drainage to m/s
      function mmh_to_mps(mm_per_hour: number) { return mm_per_hour / 1000.0 / 3600.0; }
      let rainRate = mmh_to_mps(rainfall_mm_per_hour);
      let drainRate = mmh_to_mps(drainage_mm_per_hour);

      // Bounding box (choose area)
      // Example: center on some lon/lat and create a rectangle
      const centerLon = 106.700; // replace with your area
      const centerLat = 10.762;  // replace with your area
      const halfWidthMeters = GRID_W*cellSizeMeters/2;
      const halfHeightMeters = GRID_H*cellSizeMeters/2;

      // Helper: compute lat/lon offset by meters (approx)
      function destinationLatLon(lat: number, lon: number, eastMeters: number, northMeters: number) {
        const R = 6378137.0;
        const dLat = northMeters / R;
        const dLon = eastMeters / (R * Math.cos(Math.PI * lat / 180.0));
        return {
          lat: lat + (dLat * 180.0 / Math.PI),
          lon: lon + (dLon * 180.0 / Math.PI)
        };
      }

      // Build grid lon/lat array
      const origin = destinationLatLon(centerLat, centerLon, -halfWidthMeters, -halfHeightMeters);
      const gridLons = new Array(GRID_W);
      const gridLats = new Array(GRID_H);
      for (let i = 0; i < GRID_W; ++i) {
        const east = (i + 0.5) * cellSizeMeters;
        gridLons[i] = destinationLatLon(origin.lat, origin.lon, east, 0).lon;
      }
      for (let j = 0; j < GRID_H; ++j) {
        const north = (j + 0.5) * cellSizeMeters;
        gridLats[j] = destinationLatLon(origin.lat, origin.lon, 0, north).lat;
      }

      // Prepare arrays
      const terrainHeights = new Float32Array(GRID_W * GRID_H); // meters
      const waterDepth = new Float32Array(GRID_W * GRID_H);     // meters
      function idx(i: number, j: number){ return j*GRID_W + i; }

      // Sample Cesium terrain heights at our grid points (most detailed)
      // Build positions
      const samplePositions = [];
      for (let j=0;j<GRID_H;j++){
        for (let i=0;i<GRID_W;i++){
          samplePositions.push(Cesium.Cartographic.fromDegrees(gridLons[i], gridLats[j]));
        }
      }
      // Use sampleTerrainMostDetailed if available, otherwise sampleTerrain
      const terrainProvider = viewer.terrainProvider;
      console.log({terrainProvider});
      let sampled;
      try {
        sampled = await Cesium.sampleTerrainMostDetailed(terrainProvider, samplePositions);
      } catch (e) {
        // fallback: sampleTerrain with level (may require different API depending on Cesium version)
        const level = 11;
        sampled = await Cesium.sampleTerrain(terrainProvider, level, samplePositions);
      }
      sampled.forEach((carto, n) => {
        const h = carto.height || 0;
        terrainHeights[n] = h;
        waterDepth[n] = 0.0; // start dry
      });

      // Build initial water mesh primitive function
      let waterPrimitive: Cesium.Primitive | null = null;
      function buildWaterPrimitive() {
        // Create grid vertices and triangles
        const positions = [];
        const indices = [];
        // vertices at grid points
        for (let j=0;j<GRID_H;j++){
          for (let i=0;i<GRID_W;i++){
            const lon = gridLons[i];
            const lat = gridLats[j];
            const h = terrainHeights[idx(i,j)] + waterDepth[idx(i,j)];
            const cart = Cesium.Cartesian3.fromDegrees(lon, lat, h);
            positions.push(cart.x, cart.y, cart.z);
          }
        }
        // build indices for triangles
        for (let j=0;j<GRID_H-1;j++){
          for (let i=0;i<GRID_W-1;i++){
            const a = idx(i,j);
            const b = idx(i+1,j);
            const c = idx(i,j+1);
            const d = idx(i+1,j+1);
            // two triangles (a, b, c) and (b, d, c)
            indices.push(a,b,c);
            indices.push(b,d,c);
          }
        }
        // Build geometry
        const vertexFormat = Cesium.VertexFormat.POSITION_AND_NORMAL;
        const geometry = new Cesium.Geometry({
          attributes : {
            position: new Cesium.GeometryAttribute({
              componentDatatype: Cesium.ComponentDatatype.DOUBLE,
              componentsPerAttribute: 3,
              values: new Float64Array(positions)
            }),
            normal: undefined,
            st: undefined,
            bitangent: undefined,
            tangent: undefined,
            color: undefined
          },
          indices : new Uint32Array(indices),
          primitiveType : Cesium.PrimitiveType.TRIANGLES,
          boundingSphere : Cesium.BoundingSphere.fromVertices(positions)
        });

        const geometryInstance = new Cesium.GeometryInstance({
          geometry : geometry,
          attributes : {
            color : Cesium.ColorGeometryInstanceAttribute.fromColor(
              Cesium.Color.fromAlpha(Cesium.Color.BLUE, 0.45))
          }
        });

        // Appearance: translucent water
        const appearance = new Cesium.EllipsoidSurfaceAppearance({
          material : Cesium.Material.fromType('Color', {
            color : new Cesium.Color(0.0, 0.35, 0.8, 0.45)
          })
        });

        const prim = new Cesium.Primitive({
          geometryInstances : [geometryInstance],
          appearance : new Cesium.PerInstanceColorAppearance({
            flat : true,
            translucent : true
          }),
          asynchronous : false,
          releaseGeometryInstances : false
        });

        return prim;
      }

      // Add and update functions
      function addWaterPrimitiveToScene() {
        if (waterPrimitive) { viewer.scene.primitives.remove(waterPrimitive); }
        waterPrimitive = buildWaterPrimitive();
        viewer.scene.primitives.add(waterPrimitive);
      }

      // Simulation core: single time step
      function stepSimulationOnce(dtSeconds: number) {
        // 4-neighbor flow
        const newWater = new Float32Array(waterDepth.length);
        // start with existing + rainfall*dt - drainage*dt (drain as percolation)
        const rainAdd = rainRate * dtSeconds;
        const drainRemove = drainRate * dtSeconds;
        for (let n=0;n<waterDepth.length;n++){
          newWater[n] = waterDepth[n] + rainAdd;
          newWater[n] = Math.max(0, newWater[n] - drainRemove);
        }

        // flows
        // We'll compute flow from each cell to its 4 neighbors based on head difference
        const outFlow = new Float32Array(waterDepth.length); // total outgoing per cell (m)
        const inFlow = new Float32Array(waterDepth.length);
        for (let j=0;j<GRID_H;j++){
          for (let i=0;i<GRID_W;i++){
            const id = idx(i,j);
            const H_i = terrainHeights[id] + waterDepth[id];
            const neighbors = [];
            if (i>0) neighbors.push(idx(i-1,j));
            if (i<GRID_W-1) neighbors.push(idx(i+1,j));
            if (j>0) neighbors.push(idx(i,j-1));
            if (j<GRID_H-1) neighbors.push(idx(i,j+1));
            let totalOut = 0.0;
            const flows = [];
            for (const nb of neighbors) {
              const H_j = terrainHeights[nb] + waterDepth[nb];
              const headDiff = H_i - H_j;
              const f = Math.max(0, flowK * headDiff * dtSeconds / 1.0); // m volume per cell-edge (simple)
              flows.push({nb, f});
              totalOut += f;
            }
            // Limit outflow to available water in this cell
            const avail = waterDepth[id] + rainAdd; // note: we already added rain
            let scale = 1.0;
            if (totalOut > avail && totalOut > 0) scale = avail / totalOut;
            for (const fr of flows) {
              const amount = fr.f * scale;
              outFlow[id] += amount;
              inFlow[fr.nb] += amount;
            }
          }
        }

        // Apply flows to newWater
        for (let n=0;n<newWater.length;n++){
          newWater[n] = newWater[n] - outFlow[n] + inFlow[n];
          if (newWater[n] < 1e-6) newWater[n] = 0;
        }

        // Commit
        for (let n=0;n<waterDepth.length;n++){
          waterDepth[n] = newWater[n];
        }
      }

      // Start: add water primitive
      addWaterPrimitiveToScene();

      // Animation loop
      let last = performance.now();
      viewer.clock.onTick.addEventListener(function(clock) {
        const now = performance.now();
        const realDt = (now - last) / 1000.0;
        // run simulation at fixed dt increments (could accumulate)
        const steps = Math.max(1, Math.floor(realDt / dt));
        for (let s=0;s<steps;s++) {
          stepSimulationOnce(dt);
        }
        last = now;

        // update water primitive by removing and rebuilding (simple)
        // For efficiency you'd update vertex buffer directly if available.
        if (waterPrimitive) { viewer.scene.primitives.remove(waterPrimitive); }
        waterPrimitive = buildWaterPrimitive();
        viewer.scene.primitives.add(waterPrimitive);
      });

      // Expose controls for user input (rainfall/drainage)
      window.setRainfall = function(mmh: number) {
        rainfall_mm_per_hour = mmh;
        rainRate = mmh_to_mps(mmh);
        console.log("Rain rate set:", mmh, "mm/h");
      };
      window.setDrainage = function(mmh: number) {
        drainage_mm_per_hour = mmh;
        drainRate = mmh_to_mps(mmh);
        console.log("Drain rate set:", mmh, "mm/h");
      };

      console.log("Flood sim started. Use setRainfall(mmPerHour) and setDrainage(mmPerHour) in console.");
    })();
  }
}
