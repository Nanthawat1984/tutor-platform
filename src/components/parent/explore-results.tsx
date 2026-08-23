'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  LocateFixed,
  MapPin,
  Loader2,
  List,
  Map as MapIcon,
  Navigation,
  GraduationCap,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RatingStars } from '@/components/ui/rating';
import { EmptyState } from '@/components/layout/dashboard';
import { formatCurrency, getInitials } from '@/lib/utils';
import { loadGoogleMaps, hasGoogleMapsKey } from '@/lib/maps/loader';
import { haversineDistance, formatDistance, isValidLatLng } from '@/lib/geo';

export interface ExploreCourse {
  id: string;
  title: string;
  teacherId: string;
  teacherName: string;
  subjectName: string;
  level: string;
  format: string;
  pricePerSession: number;
  centerId?: string | null;
  centerName?: string | null;
  photoURL?: string | null;
  rating: number;
  totalReviews: number;
  experienceYears?: number;
  education?: string;
  lat?: number | null;
  lng?: number | null;
}

interface ExploreResultsProps {
  courses: ExploreCourse[];
}

const formatLabel: Record<string, string> = {
  one_on_one: 'ตัวต่อตัว',
  small_group: 'กลุ่มเล็ก',
  online: 'ออนไลน์',
  hybrid: 'ผสม',
};

export default function ExploreResults({ courses }: ExploreResultsProps) {
  const [view, setView] = useState<'list' | 'map'>('list');
  const [mapsReady, setMapsReady] = useState(false);
  const [mapsError, setMapsError] = useState('');
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);

  // คอร์สที่มีพิกัด
  const locatedCourses = useMemo(
    () => courses.filter((c) => isValidLatLng(c.lat, c.lng)),
    [courses]
  );

  // เรียงตามระยะทาง (เมื่อมีตำแหน่งผู้ใช้)
  const sortedCourses = useMemo(() => {
    if (!userPos) return courses;
    return [...courses].sort((a, b) => {
      const da = isValidLatLng(a.lat, a.lng)
        ? haversineDistance(userPos.lat, userPos.lng, a.lat!, a.lng!)
        : Infinity;
      const db = isValidLatLng(b.lat, b.lng)
        ? haversineDistance(userPos.lat, userPos.lng, b.lat!, b.lng!)
        : Infinity;
      return da - db;
    });
  }, [courses, userPos]);

  function distanceOf(course: ExploreCourse): number | null {
    if (!userPos || !isValidLatLng(course.lat, course.lng)) return null;
    return haversineDistance(userPos.lat, userPos.lng, course.lat!, course.lng!);
  }

  // โหลด Google Maps
  useEffect(() => {
    if (!hasGoogleMapsKey()) {
      setMapsError('ยังไม่ได้ตั้งค่า NEXT_PUBLIC_GOOGLE_MAPS_API_KEY');
      return;
    }
    loadGoogleMaps()
      .then(() => setMapsReady(true))
      .catch((e: Error) => setMapsError(e.message || 'โหลดแผนที่ไม่สำเร็จ'));
  }, []);

  // สร้างแผนที่เมื่อสลับเป็น view แผนที่ หรือมีตำแหน่งผู้ใช้
  useEffect(() => {
    if (!mapsReady || view !== 'map' || !mapRef.current) return;
    const maps = window.google.maps;
    const center = userPos ?? { lat: 13.7563, lng: 100.5018 };

    if (!mapInstanceRef.current) {
      const map = new maps.Map(mapRef.current, {
        center,
        zoom: userPos ? 11 : 10,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
      });
      mapInstanceRef.current = map;
      infoWindowRef.current = new maps.InfoWindow();
    } else {
      mapInstanceRef.current.setCenter(center);
    }

    // ลบ marker เก่า
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    // หมุดผู้ใช้
    if (userPos) {
      const userMarker = new maps.Marker({
        position: userPos,
        map: mapInstanceRef.current,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: '#ec4899',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
        title: 'ตำแหน่งของคุณ',
      });
      markersRef.current.push(userMarker);
    }

    // หมุดคอร์ส
    locatedCourses.forEach((course) => {
      if (!isValidLatLng(course.lat, course.lng)) return;
      const marker = new maps.Marker({
        position: { lat: course.lat!, lng: course.lng! },
        map: mapInstanceRef.current,
        title: course.title,
      });
      marker.addListener('click', () => {
        const dist = distanceOf(course);
        const content = `
          <div style="font-family: sans-serif; min-width: 180px;">
            <div style="font-weight: 700; color: #1e293b;">${course.title}</div>
            <div style="font-size: 12px; color: #64748b; margin-top: 2px;">ครู${course.teacherName} • ${course.subjectName} ${course.level || ''}</div>
            <div style="font-size: 12px; color: #ec4899; margin-top: 2px;">${formatCurrency(course.pricePerSession)}/ครั้ง${dist != null ? ` • ${formatDistance(dist)}` : ''}</div>
            <a href="/teachers/${course.teacherId}" style="display:inline-block; margin-top:6px; font-size:12px; font-weight:600; color:#db2777; text-decoration:underline;">ดูโปรไฟล์ครู →</a>
          </div>`;
        infoWindowRef.current.setContent(content);
        infoWindowRef.current.open(mapInstanceRef.current, marker);
      });
      markersRef.current.push(marker);
    });
  }, [mapsReady, view, userPos, locatedCourses]); // eslint-disable-line react-hooks/exhaustive-deps

  // ค้นหาใกล้ฉัน (GPS)
  function findNearMe() {
    if (!navigator.geolocation) {
      setGeoError('เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง');
      return;
    }
    setLocating(true);
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? 'ไม่อนุญาตให้ใช้ตำแหน่ง — เปิดสิทธิ์ตำแหน่งในเบราว์เซอร์แล้วลองใหม่'
            : 'ไม่สามารถระบุตำแหน่งได้ ลองอีกครั้ง'
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  if (courses.length === 0) {
    return (
      <EmptyState
        icon={<MapPin className="h-7 w-7" />}
        title="ไม่พบคอร์สที่ตรงกับการค้นหา"
        description="ลองเปลี่ยนวิชา ระดับชั้น หรือตำแหน่ง แล้วค้นหาอีกครั้ง"
        action={{ label: 'ดูคอร์สทั้งหมด', href: '/explore' }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* แถบเครื่องมือ: ใกล้ฉัน + สลับมุมมอง */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={userPos ? 'primary' : 'outline'}
          size="sm"
          onClick={findNearMe}
          disabled={locating}
        >
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
          {userPos ? 'ค้นหาใกล้ฉัน (เปิดอยู่)' : 'ค้นหาใกล้ฉัน'}
        </Button>
        {hasGoogleMapsKey() && locatedCourses.length > 0 && (
          <div className="ml-auto flex rounded-xl border border-pink-100 bg-white/80 p-1">
            <button
              type="button"
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                view === 'list' ? 'bg-pink-500 text-white' : 'text-slate-500 hover:bg-pink-50'
              }`}
            >
              <List className="h-4 w-4" /> รายการ
            </button>
            <button
              type="button"
              onClick={() => setView('map')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                view === 'map' ? 'bg-pink-500 text-white' : 'text-slate-500 hover:bg-pink-50'
              }`}
            >
              <MapIcon className="h-4 w-4" /> แผนที่
            </button>
          </div>
        )}
      </div>

      {geoError && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{geoError}</span>
        </div>
      )}

      {userPos && (
        <p className="flex items-center gap-1.5 text-sm text-slate-500">
          <Navigation className="h-4 w-4 text-pink-500" />
          เรียงตามระยะทางจากตำแหน่งของคุณ
        </p>
      )}

      {/* แผนที่ */}
      {view === 'map' && (
        <Card className="overflow-hidden p-0">
          {mapsError ? (
            <div className="flex items-start gap-2 p-4 text-sm text-amber-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{mapsError}</span>
            </div>
          ) : !mapsReady ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลดแผนที่...
            </div>
          ) : (
            <div ref={mapRef} className="h-[420px] w-full" />
          )}
        </Card>
      )}

      {/* รายการคอร์ส */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sortedCourses.map((course) => {
          const dist = distanceOf(course);
          return (
            <Card key={course.id} className="flex flex-col hoverable">
              <Link href={`/teachers/${course.teacherId}`} className="group flex items-start gap-3">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-pink-100 to-rose-100">
                  {course.photoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={course.photoURL}
                      alt={course.teacherName || 'ครู'}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center font-bold text-pink-700">
                      {getInitials(course.teacherName || 'ครู')}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="truncate font-semibold text-gray-900 group-hover:text-pink-700">
                      ครู{course.teacherName}
                    </h3>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-pink-400 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <RatingStars rating={course.rating} showValue reviewCount={course.totalReviews} size="sm" className="mt-0.5" />
                  {course.experienceYears != null && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                      <GraduationCap className="h-3 w-3" />
                      ประสบการณ์ {course.experienceYears} ปี{course.education ? ` • ${course.education}` : ''}
                    </p>
                  )}
                </div>
              </Link>

              <div className="mt-3 flex-1">
                <Link href={`/teachers/${course.teacherId}`} className="font-semibold text-gray-900 hover:text-pink-700">
                  {course.title}
                </Link>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant="info">{course.subjectName}</Badge>
                  {course.level && <Badge variant="default">{course.level}</Badge>}
                  <Badge variant="default">{formatLabel[course.format] || course.format}</Badge>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-pink-100/70 pt-3">
                <div>
                  <p className="text-lg font-bold text-pink-600">{formatCurrency(course.pricePerSession)}</p>
                  <p className="text-xs text-slate-400">ต่อเซสชัน</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {dist != null ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-600">
                      <MapPin className="h-3 w-3" /> {formatDistance(dist)}
                    </span>
                  ) : course.centerName ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-2.5 py-1 text-xs font-semibold text-pink-600">
                      <MapPin className="h-3 w-3" /> {course.centerName}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                      ออนไลน์
                    </span>
                  )}
                  <Link
                    href={`/teachers/${course.teacherId}`}
                    className="text-xs font-semibold text-pink-600 hover:underline"
                  >
                    ดูรายละเอียด →
                  </Link>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}