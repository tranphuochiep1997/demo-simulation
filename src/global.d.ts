// src/typings.d.ts or src/app/declarations.d.ts
declare global {
    interface Window {
        CESIUM_BASE_URL: string; // Declare your custom property and its type
        setRainfall: Function;
        setDrainage: Function;
        setRainfall24h: Function;
        setDrainage_mm_per_hour: Function;
        addWaterPulse: Function;
    }
}
export {};