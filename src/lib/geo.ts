// Geo helpers — ระยะทาง + การจัดรูปแบบ (ใช้ได้ทั้ง server/client)

const EARTH_RADIUS_KM = 6371;

/**
 * คำนวณระยะทาง (กิโลเมตร) ระหว่าง 2 พิกัด ด้วย Haversine formula
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * จัดรูปแบบระยะทางเป็นภาษาไทย: "850 ม." / "1.2 กม."
 */
export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.max(1, Math.round(km * 1000))} ม.`;
  }
  return `${km.toFixed(1)} กม.`;
}

/**
 * ตรวจสอบว่าพิกัดเป็นค่าที่ใช้ได้หรือไม่
 */
export function isValidLatLng(lat?: number | null, lng?: number | null): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}