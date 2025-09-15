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
    // === Setup ===
    const centerLon = 106.70002399070714; // e.g. Hanoi
    const centerLat = 10.761931120498742;
    const degreesPerCell = 0.0005; // resolution in degrees
    const gridSize = 100;
    const cellSize = 100; // meters

    let terrainHeights = new Float32Array(gridSize * gridSize);
    let waterDepth = new Float32Array(gridSize * gridSize);

    // Example: flat terrain with a dip
    for (let j = 0; j < gridSize; j++) {
      for (let i = 0; i < gridSize; i++) {
        terrainHeights[j * gridSize + i] = 
          Math.sin(i * 0.05) * 2.0 + Math.cos(j * 0.05) * 2.0; // some relief
      }
    }

    // === Vertex data ===
    function createVertices() {
      const positions = new Float32Array(gridSize * gridSize * 3);
      const indices = [];
      const sts = [];
      let k = 0;

      for (let j = 0; j < gridSize; j++) {
        for (let i = 0; i < gridSize; i++) {
          const idx = j * gridSize + i;
          const lon = centerLon + (i - gridSize/2) * degreesPerCell;
          const lat = centerLat + (j - gridSize/2) * degreesPerCell;
          const h = terrainHeights[idx] + waterDepth[idx];
          const pos = Cesium.Cartesian3.fromDegrees(lon, lat, h);
          positions[k++] = pos.x;
          positions[k++] = pos.y;
          positions[k++] = pos.z;
          // simple UVs normalized to grid
          sts.push(i / (gridSize - 1), j / (gridSize - 1));
        }
      }

      // build indices for grid mesh
      for (let j = 0; j < gridSize - 1; j++) {
        for (let i = 0; i < gridSize - 1; i++) {
          const i0 = j * gridSize + i;
          const i1 = i0 + 1;
          const i2 = i0 + gridSize;
          const i3 = i2 + 1;
          indices.push(i0, i2, i1, i1, i2, i3);
        }
      }

      return { positions, indices: new Uint32Array(indices), sts };
    }

    // === Create Primitive with updatable buffer ===
    const { positions, indices, sts } = createVertices();
    const positionsArray = Array.from(positions);
    // const geometry = new Cesium. Geometry({
    //   attributes: {
    //     position: new Cesium.GeometryAttribute({
    //       componentDatatype: Cesium.ComponentDatatype.DOUBLE,
    //       componentsPerAttribute: 3,
    //       values: positions
    //     }),
    //     normal: undefined,
    //     st: undefined,
    //     bitangent: undefined,
    //     tangent: undefined,
    //     color: undefined,
    //   },
    //   indices,
    //   primitiveType: Cesium.PrimitiveType.TRIANGLES,
    //   boundingSphere: Cesium.BoundingSphere.fromVertices(positionsArray),
    // });

    // build geometry
    const geometry = new Cesium.Geometry({
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
      indices: new Uint16Array(indices),
      primitiveType: Cesium.PrimitiveType.TRIANGLES,
      boundingSphere: Cesium.BoundingSphere.fromVertices(positionsArray),
    });
    
    const geometryInstance = new Cesium.GeometryInstance({
      geometry : geometry,
      attributes : {
        color : Cesium.ColorGeometryInstanceAttribute.fromColor(
          Cesium.Color.fromAlpha(Cesium.Color.BLUE, 0.45))
      }
    });

    const waterMaterial = new Cesium.Material({
      fabric: {
        type: 'Water',
        uniforms: {
          baseWaterColor: new Cesium.Color(0.0, 0.3, 0.6, 0.5),
          normalMap: Cesium.buildModuleUrl('Assets/Textures/waterNormals.jpg'),
          frequency: 1000.0,
          animationSpeed: 0.02,
          amplitude: 10.0,
          specularIntensity: 0.5
        }
      }
    });

    const primitive = new Cesium.Primitive({
      geometryInstances: geometryInstance,
      appearance: new Cesium.MaterialAppearance({
        translucent: true,
        material: waterMaterial,
        flat: true,
      }),
      asynchronous: false
    });

    viewer.scene.primitives.add(primitive);

    // === Water simulation loop ===
    function stepSimulation() {
      // very basic: increase rainfall in the middle
      const rainIdx = Math.floor(gridSize/2) * gridSize + Math.floor(gridSize/2);
      waterDepth[rainIdx] += 0.2; // add water only at center

      // simple spreading
      const newWater = new Float32Array(waterDepth);
      for (let j = 1; j < gridSize-1; j++) {
        for (let i = 1; i < gridSize-1; i++) {
          const idx = j * gridSize + i;
          const h = terrainHeights[idx] + waterDepth[idx];

          for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const n = (j+dj) * gridSize + (i+di);
            const hn = terrainHeights[n] + waterDepth[n];
            if (h > hn + 0.01) {
              const flow = (h - hn) * 0.25;
              newWater[idx] -= flow;
              newWater[n] += flow;
            }
          }
        }
      }
      waterDepth = newWater;
    }

    // === Update vertex buffer in-place ===
    // === Precompute ellipsoid unit vectors (lon/lat -> Cartesian on unit sphere) ===
    const unitPositions = new Float64Array(gridSize * gridSize * 3);

    for (let j = 0; j < gridSize; j++) {
      for (let i = 0; i < gridSize; i++) {
        const idx = (j * gridSize + i) * 3;

        const lon = Cesium.Math.toRadians(centerLon + i * degreesPerCell);
        const lat = Cesium.Math.toRadians(centerLat + j * degreesPerCell);

        // On unit sphere
        const cosLat = Math.cos(lat);
        unitPositions[idx]     = cosLat * Math.cos(lon);
        unitPositions[idx + 1] = cosLat * Math.sin(lon);
        unitPositions[idx + 2] = Math.sin(lat);
      }
    }

    // === Dynamic positions buffer (uploaded each frame) ===
    const dynamicPositions = new Float64Array(gridSize * gridSize * 3);

    // Precompute Earth radius at each grid cell (for better ellipsoid scaling)
    const radii = Cesium.Ellipsoid.WGS84.radii;
    const R = (radii.x + radii.y + radii.z) / 3; // simple average radius

    function updateVertices() {
      let k = 0;

      for (let j = 0; j < gridSize; j++) {
        for (let i = 0; i < gridSize; i++) {
          const idx1 = j * gridSize + i;
          const idx3 = idx1 * 3;

          const h = terrainHeights[idx1] + waterDepth[idx1]; // meters above terrain

          // Scale unit vector by Earth radius + height
          const scale = R + h;
          dynamicPositions[k++] = unitPositions[idx3]     * scale;
          dynamicPositions[k++] = unitPositions[idx3 + 1] * scale;
          dynamicPositions[k++] = unitPositions[idx3 + 2] * scale;
        }
      }

      // Upload once per frame
      // Cast to "any" to bypass TS checks
      const gl = (viewer.scene as any).context._gl;
      // Also cast primitive to any
      let positionAttr = null;
      if ((primitive as any)._vertexArrays) {
        positionAttr = (primitive as any)._vertexArrays[0].attributes.position;
        const buf = positionAttr.vertexBuffer._buffer;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, dynamicPositions);
      }
    }

    // === Animate ===
    viewer.clock.onTick.addEventListener(() => {
      stepSimulation();
      updateVertices();
    });
  }
}
