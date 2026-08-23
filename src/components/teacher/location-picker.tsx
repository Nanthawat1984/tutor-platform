'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2, AlertTriangle, LocateFixed } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { loadGoogleMaps, hasGoogleMapsKey } from '@/lib/maps/loader';

interface LocationPickerProps {
  namePrefix?: string;
  defaultName?: string;
  defaultLat?: number | null;
  defaultLng?: number | null;
  defaultAddress?: string;
  defaultSubdistrict?: string;
  defaultDistrict?: string;
  defaultProvince?: string;
  defaultPostalCode?: string;
}

/**
 * เลือกสถานที่สอน: ค้นหาที่อยู่ (Places Autocomplete) + ปักหมุดบนแผนที่ + กรอกเอง
 * เก็บค่าเป็น hidden inputs (namePrefix_*) ให้ server action อ่านได้
 */
export default function LocationPicker({
  namePrefix = 'location',
  defaultName = '',
  defaultLat = null,
  defaultLng = null,
  defaultAddress = '',
  defaultSubdistrict = '',
  defaultDistrict = '',
  defaultProvince = '',
  defaultPostalCode = '',
}: LocationPickerProps) {
  const [mapsReady, setMapsReady] = useState(false);
  const [mapsError, setMapsError] = useState('');
  const [locating, setLocating] = useState(false);

  const [lat, setLat] = useState<number | null>(defaultLat);
  const [lng, setLng] = useState<number | null>(defaultLng);
  const [address, setAddress] = useState(defaultAddress);
  const [subdistrict, setSubdistrict] = useState(defaultSubdistrict);
  const [district, setDistrict] = useState(defaultDistrict);
  const [province, setProvince] = useState(defaultProvince);
  const [postalCode, setPostalCode] = useState(defaultPostalCode);

  const mapRef = useRef<HTMLDivElement>(null);
  const autocompleteInputRef = useRef<HTMLInputElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // โหลด Google Maps
  useEffect(() => {
    if (!hasGoogleMapsKey()) {
      setMapsError('ยังไม่ได้ตั้งค่า NEXT_PUBLIC_GOOGLE_MAPS_API_KEY — กรอกที่อยู่ด้วยตนเองได้');
      return;
    }
    loadGoogleMaps()
      .then(() => setMapsReady(true))
      .catch((e: Error) => setMapsError(e.message || 'โหลด Google Maps ไม่สำเร็จ'));
  }, []);

  // สร้างแผนที่ + Autocomplete เมื่อ Maps พร้อม
  useEffect(() => {
    if (!mapsReady || !mapRef.current) return;
    const maps = window.google.maps;
    const hasPos = lat != null && lng != null;
    const initial = hasPos ? { lat, lng } : { lat: 13.7563, lng: 100.5018 };

    const map = new maps.Map(mapRef.current, {
      center: initial,
      zoom: hasPos ? 15 : 11,
      mapTypeControl: false,
      fullscreenControl: false,
      streetViewControl: false,
    });
    mapInstanceRef.current = map;

    const marker = new maps.Marker({
      position: initial,
      map,
      draggable: true,
      title: 'ลากเพื่อปรับตำแหน่ง',
    });
    markerRef.current = marker;

    marker.addListener('dragend', () => {
      const pos = marker.getPosition();
      if (!pos) return;
      setLat(pos.lat());
      setLng(pos.lng());
    });

    // Places Autocomplete (ค้นหาที่อยู่ในไทย)
    if (autocompleteInputRef.current) {
      const ac = new maps.places.Autocomplete(autocompleteInputRef.current, {
        componentRestrictions: { country: 'TH' },
        fields: ['address_components', 'geometry', 'formatted_address', 'name'],
      });
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (!place.geometry?.location) return;
        const pos = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() };
        setLat(pos.lat);
        setLng(pos.lng);
        map.setCenter(pos);
        map.setZoom(16);
        marker.setPosition(pos);
        setAddress(place.formatted_address || place.name || '');

        let sub = '';
        let dist = '';
        let prov = '';
        let postal = '';
        for (const comp of place.address_components || []) {
          const types: string[] = comp.types;
          if (types.includes('sublocality_level_2') || types.includes('sublocality_level_1')) sub = comp.long_name;
          if (types.includes('administrative_area_level_2')) dist = comp.long_name;
          if (types.includes('administrative_area_level_1')) prov = comp.long_name;
          if (types.includes('postal_code')) postal = comp.long_name;
        }
        setSubdistrict(sub);
        setDistrict(dist);
        setProvince(prov);
        setPostalCode(postal);
      });
    }
  }, [mapsReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // ใช้ตำแหน่งปัจจุบัน (GPS)
  function useMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLat(p.lat);
        setLng(p.lng);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setCenter(p);
          mapInstanceRef.current.setZoom(16);
        }
        if (markerRef.current) markerRef.current.setPosition(p);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div className="space-y-4">
      {/* Hidden inputs สำหรับ server action */}
      <input type="hidden" name={`${namePrefix}_latitude`} value={lat ?? ''} />
      <input type="hidden" name={`${namePrefix}_longitude`} value={lng ?? ''} />
      <input type="hidden" name={`${namePrefix}_address`} value={address} />
      <input type="hidden" name={`${namePrefix}_subdistrict`} value={subdistrict} />
      <input type="hidden" name={`${namePrefix}_district`} value={district} />
      <input type="hidden" name={`${namePrefix}_province`} value={province} />
      <input type="hidden" name={`${namePrefix}_postal_code`} value={postalCode} />

      <Input
        label="ชื่อสถานที่"
        name={`${namePrefix}_name`}
        defaultValue={defaultName}
        placeholder="เช่น บ้านครู, ศูนย์ติวเตอร์ ABC, สยามสแควร์"
      />

      {mapsError ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{mapsError}</span>
        </div>
      ) : !mapsReady ? (
        <div className="flex items-center gap-2 rounded-xl border border-pink-100 bg-pink-50/50 p-3 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          กำลังโหลดแผนที่...
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pink-400" />
              <input
                ref={autocompleteInputRef}
                type="text"
                placeholder="ค้นหาที่อยู่ เช่น สยามสแควร์, ถนนสุขุมวิท 55..."
                className="min-h-[44px] w-full rounded-xl border border-pink-100 bg-white/90 pl-9 pr-3 py-2 text-base text-slate-900 shadow-inner-lg focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100/60 sm:text-sm"
              />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={useMyLocation} disabled={locating} className="sm:w-auto">
              <LocateFixed className="h-4 w-4" />
              {locating ? 'กำลังหา...' : 'ใช้ตำแหน่งฉัน'}
            </Button>
          </div>

          <div ref={mapRef} className="h-64 w-full rounded-xl border border-pink-100 shadow-inner-lg" />

          <p className="text-xs text-slate-400">
            💡 ค้นหาที่อยู่แล้วเลือก หรือลากหมุดบนแผนที่เพื่อปรับตำแหน่งให้แม่นยำ
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input
            label="ที่อยู่"
            name={`${namePrefix}_address`}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="เลขที่ ถนน หมู่บ้าน..."
          />
        </div>
        <Input
          label="ตำบล/แขวง"
          name={`${namePrefix}_subdistrict`}
          value={subdistrict}
          onChange={(e) => setSubdistrict(e.target.value)}
        />
        <Input
          label="อำเภอ/เขต"
          name={`${namePrefix}_district`}
          value={district}
          onChange={(e) => setDistrict(e.target.value)}
        />
        <Input
          label="จังหวัด"
          name={`${namePrefix}_province`}
          value={province}
          onChange={(e) => setProvince(e.target.value)}
        />
        <Input
          label="รหัสไปรษณีย์"
          name={`${namePrefix}_postal_code`}
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value)}
        />
      </div>
    </div>
  );
}