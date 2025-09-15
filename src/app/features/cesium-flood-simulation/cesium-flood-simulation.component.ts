import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { 
  Cartesian3, 
  createOsmBuildingsAsync, 
  Ion, 
  Math as CesiumMath, 
  Viewer, 
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

    async function startFloodSimMesh(viewer: Cesium.Viewer, options: FloodSimOption) {
      const centerLon = options.centerLon ?? 106.7;
      const centerLat = options.centerLat ?? 10.76;
      const gridSize = options.gridSize ?? 50;
      const degreesPerCell = options.degreesPerCell ?? 0.0005;

      const rainfall24h = options.rainfall_mm_per_24h ?? 200; // mm/24h
      const drainage = options.drainage_mm_per_hour ?? 0;
      const simSpeed = options.simSpeed ?? 60;

      const rainfallPerHour = () => rainfall24h / 24.0;
      const mmh_to_m_per_s = (mmh: number) => (mmh / 1000.0) / 3600.0;

      const cells = gridSize * gridSize;
      const vertsPerSide = gridSize + 1;

      // Build lon/lat grid
      const half = gridSize / 2;
      const lonArr = new Array(vertsPerSide);
      const latArr = new Array(vertsPerSide);
      for (let i = 0; i < vertsPerSide; i++) {
        lonArr[i] = centerLon + (i - half) * degreesPerCell;
        latArr[i] = centerLat + (i - half) * degreesPerCell;
      }

      // Sample terrain
      const cartos: Cesium.Cartographic[] = [];
      for (let j = 0; j < vertsPerSide; j++) {
        for (let i = 0; i < vertsPerSide; i++) {
          cartos.push(Cesium.Cartographic.fromDegrees(lonArr[i], latArr[j]));
        }
      }
      const terrainHeights = new Float32Array(cartos.length);
      const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, cartos);
      sampled.forEach((c, idx) => (terrainHeights[idx] = c.height || 0));

      const waterDepth = new Float32Array(cells); // per cell (meters)
      waterDepth.fill(0.0);
      let waterPrimitive: Cesium.Primitive | undefined;
      viewer.scene.globe.depthTestAgainstTerrain = true;
      // ==== Simulation ====
      function simStep(dtSeconds: number) {
        const rain_m = mmh_to_m_per_s(rainfallPerHour()) * dtSeconds;
        const drain_m = mmh_to_m_per_s(drainage) * dtSeconds;

        for (let i = 0; i < cells; i++) {
          waterDepth[i] += rain_m;
          waterDepth[i] = Math.max(0, waterDepth[i] - drain_m);
        }
      }

      // ==== Build water primitive from depths ====
      function makeWaterPrimitive(): Cesium.Primitive {
        const vertsPerSide = gridSize + 1;
        const positions: number[] = [];
        const sts: number[] = [];
        const indices: number[] = [];

        // Build vertex positions with current waterDepth
        for (let j = 0; j < vertsPerSide; j++) {
          for (let i = 0; i < vertsPerSide; i++) {
            const idx = j * vertsPerSide + i;
            const terrainH = terrainHeights[idx];
            // Find surrounding cell depths (average)
            let depth = 0, count = 0;
            if (i < gridSize && j < gridSize) { depth += waterDepth[j * gridSize + i]; count++; }
            if (i > 0 && j < gridSize) { depth += waterDepth[j * gridSize + (i - 1)]; count++; }
            if (i < gridSize && j > 0) { depth += waterDepth[(j - 1) * gridSize + i]; count++; }
            if (i > 0 && j > 0) { depth += waterDepth[(j - 1) * gridSize + (i - 1)]; count++; }
            const waterH = terrainH + (count > 0 ? depth / count : 0);
            const cart = Cesium.Cartesian3.fromDegrees(lonArr[i], latArr[j], waterH);
            positions.push(cart.x, cart.y, cart.z);
            sts.push(i / gridSize, j / gridSize);
          }
        }
        
        // Indices
        for (let j = 0; j < gridSize; j++) {
          for (let i = 0; i < gridSize; i++) {
            const a = j * vertsPerSide + i;
            const b = a + 1;
            const c = a + vertsPerSide;
            const d = c + 1;
            indices.push(a, b, c, b, d, c);
          }
        }

        const geom = new Cesium.Geometry({
          attributes: {
            position: new Cesium.GeometryAttribute({
              componentDatatype: Cesium.ComponentDatatype.DOUBLE,
              componentsPerAttribute: 3,
              values: new Float64Array(positions),
            }),
            st: new Cesium.GeometryAttribute({
              componentDatatype: Cesium.ComponentDatatype.FLOAT,
              componentsPerAttribute: 2,
              values: new Float32Array(sts),
            }),
            normal: undefined,
            bitangent: undefined,
            tangent: undefined,
            color: undefined
          },
          indices: new Uint32Array(indices),
          primitiveType: Cesium.PrimitiveType.TRIANGLES,
          boundingSphere: Cesium.BoundingSphere.fromVertices(positions),
        });

        const waterMaterial = new Cesium.Material({
          fabric: {
            type: "Water",
            uniforms: {
              baseWaterColor: new Cesium.Color(0.0, 0.3, 0.8, 0.6),
              normalMap: Cesium.buildModuleUrl("Assets/Textures/waterNormals.jpg"),
              frequency: 1000.0,
              animationSpeed: 0.02,
              amplitude: 1.0,
              specularIntensity: 0.5,
            },
          },
        });

        return new Cesium.Primitive({
          geometryInstances: new Cesium.GeometryInstance({ geometry: geom }),
          appearance: new Cesium.MaterialAppearance({
            material: waterMaterial,
            translucent: true,
            flat: true,
          }),
          asynchronous: false,
        });
      }
      // --- Simulation loop
      let last = performance.now() / 1000;
      viewer.scene.preRender.addEventListener(() => {
        const now = performance.now() / 1000;
        let dt = now - last;
        last = now;
        if (dt <= 0) return;
        if (dt > 1.0) dt = 1.0;
        dt *= simSpeed;

        // Run rainfall/drainage update
        simStep(dt);

        // Rebuild primitive
        if (waterPrimitive) viewer.scene.primitives.remove(waterPrimitive);
        waterPrimitive = makeWaterPrimitive();
        viewer.scene.primitives.add(waterPrimitive);
      });
    }

    // USAGE: after you create 'viewer'
    startFloodSimMesh(viewer, { 
      centerLon, 
      centerLat, 
      gridSize: 100, 
      rainfall_mm_per_24h: 50, 
      drainage_mm_per_hour: 1,
      simSpeed: 1
    });
  }
}
