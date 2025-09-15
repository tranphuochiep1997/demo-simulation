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
  DistanceDisplayCondition
} from 'cesium';

@Component({
  selector: 'app-cesium-viewer',
  imports: [],
  standalone: true,
  templateUrl: './cesium-viewer.component.html',
  styleUrl: './cesium-viewer.component.scss'
})
export class CesiumViewerComponent implements OnInit {
  @ViewChild('cesiumContainer', { static: true }) cesiumContainer!: ElementRef;

  async ngOnInit() {
    Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2OWRjNDZjZi1hOTMwLTQzMGYtYTJiOS05MjVmMGM5MTZmMmIiLCJpZCI6MzA2NjUwLCJpYXQiOjE3NDgzMzQzMTl9.i7Fkt8f5lxgAt-6jInFQ8rRYDUClRLTbQbAbTQAek7I';
    // Initialize the Cesium Viewer in the HTML element with the `cesiumContainer` ID.
    const viewer = new Viewer(this.cesiumContainer.nativeElement, {
      shouldAnimate: true,
      terrain: Terrain.fromWorldTerrain(),
    });    

    // Fly the camera to San Francisco at the given longitude, latitude, and height.
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(105.78104413658636, 21.043793888939884, 30),
      orientation: {
        heading: CesiumMath.toRadians(0.0),
        pitch: CesiumMath.toRadians(-15.0)
      }
    });
    // Add Cesium OSM Buildings, a global 3D buildings layer.
    const buildingTileset = await createOsmBuildingsAsync();
    viewer.scene.primitives.add(buildingTileset);  

    //================================Robot Move===================================================
    //Make sure viewer is at the desired time.
    const start = JulianDate.fromDate(new Date(2018, 11, 12, 15));
    const totalSeconds = 30;
    const stop = JulianDate.addSeconds(
      start,
      totalSeconds,
      new JulianDate(),
    );
    viewer.clock.startTime = start.clone();
    viewer.clock.stopTime = stop.clone();
    viewer.clock.currentTime = start.clone();
    viewer.clock.clockRange = ClockRange.LOOP_STOP;
    viewer.timeline.zoomTo(start, stop);
    const position = new SampledPositionProperty();
    const distance = new SampledProperty(Number);
    const startPosition = Cartesian3.fromDegrees(
      105.78114072450732, 21.04484532162663, -15
    );
    const endPosition = Cartesian3.fromDegrees(
      105.7814644703005, 21.049139747753678, -15
    );
    // A velocity vector property will give us the entity's speed and direction at any given time.
    const velocityVectorProperty = new VelocityVectorProperty(position, false);

    const numberOfSamples = 100;
    let prevLocation = startPosition;
    let totalDistance = 0;
    for (let i = 0; i <= numberOfSamples; ++i) {
      const factor = i / numberOfSamples;
      const time = JulianDate.addSeconds(
        start,
        factor * totalSeconds,
        new JulianDate(),
      );

      // Lerp using a non-linear factor so that the model accelerates.
      const locationFactor = Math.pow(factor, 2);

      // Move at constant speed
      const location = Cartesian3.lerp(
        startPosition,
        endPosition,
        factor,
        new Cartesian3(),
      );
      position.addSample(time, location);
      distance.addSample(
        time,
        (totalDistance += Cartesian3.distance(location, prevLocation)),
      );
      prevLocation = location;
    }

      try {
        const modelPrimitive = viewer.scene.primitives.add(
          // await Model.fromGltfAsync({
          //   url: "Zv2eybVsGrYSwUFj_Cesium_Air.glb",
          //   scale: 2,
          // }),
          await Model.fromGltfAsync({
            url: "Cesium_Man.glb",
            scale: 10,
          })
        );

        modelPrimitive.readyEvent.addEventListener(() => {
          modelPrimitive.activeAnimations.addAll({
            loop: ModelAnimationLoop.REPEAT,
            animationTime: function (duration: number) {
              return distance.getValue(viewer.clock.currentTime) / duration;
            },
            multiplier: 0.25,
          });
        });

        const rotation = new Matrix3();
        viewer.scene.preUpdate.addEventListener(function () {
          const time = viewer.clock.currentTime;
          const pos = position.getValue(time);
          if (!pos) return;
          const vel = velocityVectorProperty.getValue(time);
          console.log({vel});
          Cartesian3.normalize(vel, vel);
          Transforms.rotationMatrixFromPositionVelocity(
            pos,
            vel,
            viewer.scene.globe.ellipsoid,
            rotation,
          );
          Matrix4.fromRotationTranslation(
            rotation,
            pos,
            modelPrimitive.modelMatrix,
          );
        });
      } catch (error) {
        window.alert(error);
      }
      const modelLabel = viewer.entities.add({
        position: position,
        orientation: new VelocityOrientationProperty(position), // Automatically set the model's orientation to the direction it's facing.
        label: {
          text: "",
          font: "20px sans-serif",
          showBackground: true,
          distanceDisplayCondition: new DistanceDisplayCondition(0, 500.0),
          eyeOffset: new Cartesian3(0, 18, 0),
        },
      });
      viewer.trackedEntity = modelLabel;
  }
}
