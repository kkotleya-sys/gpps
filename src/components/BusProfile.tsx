import { useState, useEffect, useRef } from 'react';
import { X, Star, Camera, Video, Edit2, Save, Bell } from 'lucide-react';
import * as THREE from 'three';
import { BusWithDriver, BusProfile as BusProfileType, BusMedia, Review, Route, RouteStop, Stop, Profile } from '../types';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { StopSelector } from './StopSelector';
import { ensureNotificationPermission, loadNotificationPrefs, saveNotificationPrefs } from '../lib/notifications';

interface BusProfileProps {
  bus: BusWithDriver;
  onClose: () => void;
  isDriver?: boolean;
}

export function BusProfile({ bus, onClose, isDriver }: BusProfileProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [busProfile, setBusProfile] = useState<BusProfileType | null>(null);
  const [media, setMedia] = useState<BusMedia[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [driverProfile, setDriverProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState('');
  const [reviewFilter, setReviewFilter] = useState<'all' | 'positive' | 'negative' | number>('all');
  const [newReviewRating, setNewReviewRating] = useState(0);
  const [newReviewComment, setNewReviewComment] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [translateLoading, setTranslateLoading] = useState<string | null>(null);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifBusId, setNotifBusId] = useState(false);
  const [notifBusNumber, setNotifBusNumber] = useState(false);
  const [notifStops, setNotifStops] = useState<Stop[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<any>(null);
  const busModelRef = useRef<THREE.Object3D | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const deletingMediaRef = useRef<Set<string>>(new Set());
  const GEMINI_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY as string | undefined;

  const callGemini = async (prompt: string) => {
    if (!GEMINI_KEY) throw new Error('Missing Gemini key');
    const endpoints = [
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    ];

    let lastError: Error | null = null;
    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_KEY,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2 },
          }),
        });
        if (!res.ok) {
          lastError = new Error(`Gemini API error ${res.status}`);
          continue;
        }
        const json = await res.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return text;
        lastError = new Error('Empty Gemini response');
      } catch (e: any) {
        lastError = e;
      }
    }
    throw lastError || new Error('Gemini API error');
  };

  useEffect(() => {
    fetchBusProfile();
    fetchMedia();
    fetchReviews();
    fetchRoutes();
    fetchRouteStops();
    fetchStops();
    const prefs = loadNotificationPrefs();
    setNotifEnabled(prefs.enabled);
    setNotifBusId(prefs.busIds.includes(bus.id));
    setNotifBusNumber(prefs.busNumbers.includes(bus.bus_number));

    const profileChannel = supabase
      .channel(`bus_profile_${bus.bus_number}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bus_profiles',
          filter: `bus_number=eq.${bus.bus_number}`,
        },
        () => {
          fetchBusProfile();
        }
      )
      .subscribe();

    const mediaChannel = supabase
      .channel(`bus_media_${bus.bus_number}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bus_media',
          filter: `bus_number=eq.${bus.bus_number}`,
        },
        () => {
          fetchMedia();
        }
      )
      .subscribe();

    const reviewsChannel = supabase
      .channel(`reviews_${bus.bus_number}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reviews',
          filter: `bus_number=eq.${bus.bus_number}`,
        },
        () => {
          fetchReviews();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(mediaChannel);
      supabase.removeChannel(reviewsChannel);
    };
  }, [bus.bus_number]);

  useEffect(() => {
    if (busProfile || bus.driver_id) {
      fetchDriverProfile();
    }
  }, [busProfile, bus.driver_id]);

  useEffect(() => {
    const prefs = loadNotificationPrefs();
    setNotifStops(stops.filter((s) => prefs.stopIds.includes(s.id)));
  }, [stops]);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      50,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 1, 4);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    (async () => {
      try {
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enablePan = false;
        controls.enableZoom = true;
        controls.minDistance = 1;
        controls.maxDistance = 12;
        controls.target.set(0, 0.6, 0);
        controls.update();
        controlsRef.current = controls;
      } catch (e) {
        console.warn('OrbitControls not available', e);
      }
    })();

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);

    const loadModel = async () => {
      try {
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const loader = new GLTFLoader();

        const modelUrl = `${import.meta.env.BASE_URL}models/bus.glb`;
        loader.load(
          modelUrl,
          (gltf) => {
            const model = gltf.scene.clone();

            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());

            model.position.set(-center.x, -center.y, -center.z);

            const maxDimension = Math.max(size.x, size.y, size.z);
            const target = 6.2;
            const scale = maxDimension > 0 ? target / maxDimension : 1;
            model.scale.set(scale, scale, scale);

            model.rotation.y = Math.PI;

            if (busModelRef.current) {
              scene.remove(busModelRef.current);
            }

            scene.add(model);
            busModelRef.current = model;

            const fittedBox = new THREE.Box3().setFromObject(model);
            const fittedSize = fittedBox.getSize(new THREE.Vector3());
            const fittedCenter = fittedBox.getCenter(new THREE.Vector3());

            const fov = (camera.fov * Math.PI) / 180;
            const maxFitted = Math.max(fittedSize.x, fittedSize.y, fittedSize.z);

            const distance = maxFitted / (2 * Math.tan(fov / 2)) + 0.1;

            camera.position.set(distance * 0.3, distance * 0.15, distance * 0.45);
            camera.lookAt(fittedCenter.x, fittedCenter.y * 0.25, fittedCenter.z);
            camera.near = 0.05;
            camera.far = distance * 10;
            camera.updateProjectionMatrix();

            if (controlsRef.current) {
              controlsRef.current.target.copy(fittedCenter);
              controlsRef.current.minDistance = Math.max(0.5, distance * 0.25);
              controlsRef.current.maxDistance = Math.max(6, distance * 2);
              controlsRef.current.update();
            }
          },
          (progress) => {
            if (progress.total > 0) {
              console.log('Loading progress:', ((progress.loaded / progress.total) * 100).toFixed(0) + '%');
            }
          },
          (error) => {
            console.error('Error loading model:', error);
            const geometry = new THREE.BoxGeometry(3, 2, 1.5);
            const material = new THREE.MeshStandardMaterial({ color: 0x3b82f6 });
            const busMesh = new THREE.Mesh(geometry, material);
            busMesh.position.set(0, 0, 0);
            scene.add(busMesh);
            busModelRef.current = busMesh;
            camera.position.set(0, 1.5, 5);
            camera.lookAt(0, 0, 0);
            camera.updateProjectionMatrix();
          }
        );
      } catch (error) {
        console.error('Error importing GLTFLoader:', error);
        const geometry = new THREE.BoxGeometry(3, 2, 1.5);
        const material = new THREE.MeshStandardMaterial({ color: 0x3b82f6 });
        const busMesh = new THREE.Mesh(geometry, material);
        busMesh.position.set(0, 0, 0);
        scene.add(busMesh);
        busModelRef.current = busMesh;
        camera.position.set(0, 1.5, 5);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
      }
    };

    loadModel();

    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }

      if (controlsRef.current) {
        try {
          controlsRef.current.dispose();
        } catch {}
        controlsRef.current = null;
      }

      renderer.dispose();
      scene.clear();
    };
  }, []);
  const fetchBusProfile = async () => {
    const { data } = await supabase
      .from('bus_profiles')
      .select('*')
      .eq('bus_number', bus.bus_number)
      .maybeSingle();
    if (data) {
      setBusProfile(data as BusProfileType);
      setDescription(data.description || '');
    }
  };

  const fetchMedia = async () => {
    const { data } = await supabase
      .from('bus_media')
      .select('*')
      .eq('bus_number', bus.bus_number)
      .order('order_index', { ascending: true });
    if (data) setMedia(data as BusMedia[]);
  };

  const fetchReviews = async () => {
    const { data } = await supabase
      .from('reviews')
      .select('*, user:profiles(*)')
      .eq('bus_number', bus.bus_number)
      .order('created_at', { ascending: false });
    if (data) {
      setReviews(data.map((r: any) => ({ ...r, user: r.user })) as Review[]);
    }
  };

  const fetchRoutes = async () => {
    const { data } = await supabase
      .from('routes')
      .select('*')
      .eq('bus_number', bus.bus_number)
      .eq('is_active', true);
    if (data) setRoutes(data as Route[]);
  };

  const fetchRouteStops = async () => {
    const { data } = await supabase.from('route_stops').select('*');
    if (data) setRouteStops(data as RouteStop[]);
  };

  const fetchStops = async () => {
    const { data } = await supabase.from('stops').select('*');
    if (data) setStops(data as Stop[]);
  };

  const fetchDriverProfile = async () => {
    if (bus.driver_id) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', bus.driver_id)
        .maybeSingle();
      if (data) setDriverProfile(data as Profile);
    } else if (busProfile?.driver_id) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', busProfile.driver_id)
        .maybeSingle();
      if (data) setDriverProfile(data as Profile);
    }
  };

  const handleSaveProfile = async () => {
    if (!isDriver || !user) return;

    try {
      if (busProfile) {
        const { error } = await supabase
          .from('bus_profiles')
          .update({ description })
          .eq('id', busProfile.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('bus_profiles').insert({
          bus_number: bus.bus_number,
          driver_id: user.id,
          description,
        });
        if (error) throw error;
      }
      setEditing(false);
      await fetchBusProfile();
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Ошибка при сохранении описания');
    }
  };

  const handleMediaUpload = async (file: File, type: 'photo' | 'video') => {
    if (!isDriver || !user) return;
    if (type === 'photo' && media.filter((m) => m.media_type === 'photo').length >= 10) {
      alert(t('driver.maxPhotos'));
      return;
    }
    if (type === 'video' && file.size > 20 * 1024 * 1024) {
      alert(t('driver.maxVideo'));
      return;
    }

    setUploadingMedia(true);
    try {
      if (!user || !isDriver) {
        throw new Error('Только водители могут загружать медиа');
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${bus.bus_number}-${Date.now()}.${fileExt}`;
      const filePath = `${bus.bus_number}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('bus-media')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error(`Ошибка загрузки: ${uploadError.message}`);
      }

      const { data: urlData } = supabase.storage.from('bus-media').getPublicUrl(filePath);
      const mediaUrl = urlData.publicUrl;

      const currentMaxOrder = media
        .filter((m) => m.media_type === type)
        .reduce((max, m) => (m.order_index > max ? m.order_index : max), -1);

      const { error: insertError } = await supabase.from('bus_media').insert({
        bus_number: bus.bus_number,
        media_type: type,
        media_url: mediaUrl,
        order_index: currentMaxOrder + 1,
      });

      if (insertError) {
        console.error('Insert error:', insertError);
        throw insertError;
      }

      await fetchMedia();
    } catch (error: any) {
      console.error('Error uploading media:', error);
      alert(`Ошибка при загрузке медиа: ${error.message || 'Неизвестная ошибка'}`);
    } finally {
      setUploadingMedia(false);
    }
  };

  const getMediaPathFromUrl = (url: string) => {
    const marker = '/bus-media/';
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return url.substring(idx + marker.length);
  };

  const handleDeleteMedia = async (item: BusMedia) => {
    if (!isDriver || deletingMediaRef.current.has(item.id)) return;
    if (!confirm('Удалить медиа?')) return;
    deletingMediaRef.current.add(item.id);
    try {
      const path = getMediaPathFromUrl(item.media_url);
      if (path) {
        await supabase.storage.from('bus-media').remove([path]);
      }
      await supabase.from('bus_media').delete().eq('id', item.id);
      await fetchMedia();
    } finally {
      deletingMediaRef.current.delete(item.id);
    }
  };

  const handleSubmitReview = async () => {
    if (!user || !newReviewRating) return;

    try {
      const { error } = await supabase.from('reviews').insert({
        bus_number: bus.bus_number,
        user_id: user.id,
        rating: newReviewRating,
        comment: newReviewComment.trim() || null,
      });

      if (error) throw error;

      setNewReviewRating(0);
      setNewReviewComment('');
      await fetchReviews();
    } catch (error) {
      console.error('Error submitting review:', error);
      alert('Ошибка при добавлении отзыва');
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!user) return;
    await supabase.from('reviews').delete().eq('id', reviewId);
    fetchReviews();
  };

  const handleTranslateReview = async (review: Review, lang: 'ru' | 'tj' | 'eng') => {
    if (!review.comment) return;
    const key = `${review.id}_${lang}`;
    if (translations[key]) return;
    if (!GEMINI_KEY) {
      alert('Добавьте VITE_GEMINI_API_KEY в .env');
      return;
    }
    setTranslateLoading(key);
    try {
      const prompt = `Переведи на язык ${lang.toUpperCase()} следующий текст. Только перевод без пояснений:\n${review.comment}`;
      const text = await callGemini(prompt);
      if (text) setTranslations((prev) => ({ ...prev, [key]: text }));
    } catch (e) {
      console.error('Translate error', e);
      alert('Ошибка перевода');
    } finally {
      setTranslateLoading(null);
    }
  };

  const handleAiSummary = async () => {
    if (aiSummaryLoading) return;
    if (!GEMINI_KEY) {
      alert('Добавьте VITE_GEMINI_API_KEY в .env');
      return;
    }
    const list = reviews.map((r) => `${r.rating}/5: ${r.comment || ''}`).join('\n');
    if (!list) return;
    setAiSummaryLoading(true);
    try {
      const prompt = `Сделай короткий анализ отзывов об автобусе: общая оценка, 2-3 тезиса, что нравится и что не нравится.\nОтзывы:\n${list}`;
      const text = await callGemini(prompt);
      if (text) setAiSummary(text);
    } catch (e) {
      console.error('AI summary error', e);
      alert('Ошибка AI анализа');
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const saveNotifPrefs = async (next: { enabled?: boolean; busId?: boolean; busNumber?: boolean; stopIds?: string[] }) => {
    const current = loadNotificationPrefs();
    const enabled = next.enabled ?? current.enabled;
    const busIds = new Set(current.busIds);
    const busNumbers = new Set(current.busNumbers);
    const stopIds = new Set(next.stopIds ?? current.stopIds);

    if (next.busId !== undefined) {
      if (next.busId) busIds.add(bus.id);
      else busIds.delete(bus.id);
    }
    if (next.busNumber !== undefined) {
      if (next.busNumber) busNumbers.add(bus.bus_number);
      else busNumbers.delete(bus.bus_number);
    }

    const prefs = {
      enabled,
      busIds: Array.from(busIds),
      busNumbers: Array.from(busNumbers),
      stopIds: Array.from(stopIds),
    };
    saveNotificationPrefs(prefs);
  };

  const filteredReviews = reviews.filter((review) => {
    if (reviewFilter === 'all') return true;
    if (reviewFilter === 'positive') return review.rating >= 4;
    if (reviewFilter === 'negative') return review.rating <= 2;
    return review.rating === reviewFilter;
  });

  const activeRoute = routes.find((r) => r.is_active);
  const activeRouteStops = activeRoute
    ? routeStops
        .filter((rs) => rs.route_id === activeRoute.id)
        .sort((a, b) => a.order_index - b.order_index)
        .map((rs) => stops.find((s) => s.id === rs.stop_id))
        .filter((s): s is Stop => !!s)
    : [];

  const userReview = reviews.find((r) => r.user_id === user?.id);
  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
      : '—';
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-gray-900 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up">
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">
            {t('busProfile.title')} {t('map.busNumber')}{bus.bus_number}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div
            ref={containerRef}
            className="bg-white dark:bg-gray-800 rounded-2xl h-80 overflow-hidden relative"
            style={{ touchAction: 'none' }}
          />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                {t('map.busNumber')}{bus.bus_number}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('map.speed')}: {bus.speed.toFixed(0)} {t('map.kmh')}
              </p>
            </div>
          </div>

          {driverProfile && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50 mb-2">
                {t('busProfile.driver')}
              </h3>
              <div className="flex items-center space-x-3">
                {driverProfile.avatar_url ? (
                  <img
                    src={driverProfile.avatar_url}
                    alt="Driver"
                    className="w-12 h-12 rounded-full"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-white font-semibold">
                    {driverProfile.first_name?.[0]}{driverProfile.last_name?.[0]}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-50">
                    {driverProfile.first_name} {driverProfile.last_name}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                {t('busProfile.description')}
              </h3>
              {isDriver && (
                <button
                  onClick={() => (editing ? handleSaveProfile() : setEditing(true))}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-50"
                >
                  {editing ? <Save className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                </button>
              )}
            </div>
            {editing ? (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-50"
                rows={3}
              />
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {busProfile?.description || t('busProfile.description')}
              </p>
            )}
          </div>

          {media.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50 mb-2">
                {t('busProfile.photos')}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {media.map((item) => (
                  <div key={item.id} className="relative rounded-xl overflow-hidden">
                    {item.media_type === 'photo' ? (
                      <img src={item.media_url} alt="Bus" className="w-full h-32 object-cover" />
                    ) : (
                      <video src={item.media_url} className="w-full h-32 object-cover" controls />
                    )}
                    {isDriver && (
                      <button
                        onClick={() => handleDeleteMedia(item)}
                        className="absolute top-2 right-2 px-2 py-1 rounded-full bg-black/70 text-white text-[10px] hover:bg-black/90"
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {isDriver && (
            <div className="flex space-x-2">
              <label className="flex-1 px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-xl font-semibold flex items-center justify-center space-x-2 cursor-pointer hover:bg-gray-800 dark:hover:bg-gray-600">
                <Camera className="w-4 h-4" />
                <span>{t('driver.addPhoto')}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleMediaUpload(file, 'photo');
                  }}
                  disabled={uploadingMedia}
                />
              </label>
              <label className="flex-1 px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-xl font-semibold flex items-center justify-center space-x-2 cursor-pointer hover:bg-gray-800 dark:hover:bg-gray-600">
                <Video className="w-4 h-4" />
                <span>{t('driver.addVideo')}</span>
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleMediaUpload(file, 'video');
                  }}
                  disabled={uploadingMedia}
                />
              </label>
            </div>
          )}

          {activeRoute && activeRouteStops.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50 mb-2">
                {activeRoute.name}
              </h3>
              <div className="space-y-1">
                {activeRouteStops.map((stop, index) => {
                  const routeStop = routeStops.find(
                    (rs) => rs.route_id === activeRoute.id && rs.stop_id === stop.id
                  );
                  return (
                    <div
                      key={stop.id}
                      className="flex items-center justify-between px-3 py-2 bg-white dark:bg-gray-700 rounded-xl"
                    >
                      <span className="text-sm text-gray-900 dark:text-gray-50">
                        {index + 1}. {stop.name}
                      </span>
                      {routeStop?.arrival_time && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {routeStop.arrival_time}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">Уведомления</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Включите, чтобы получать уведомления о прибытии.
                </p>
              </div>
              <button
                onClick={async () => {
                  const allowed = await ensureNotificationPermission();
                  if (!allowed) {
                    alert('Разрешите уведомления в браузере');
                    return;
                  }
                  const next = !notifEnabled;
                  setNotifEnabled(next);
                  await saveNotifPrefs({ enabled: next });
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  notifEnabled
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-50'
                }`}
              >
                <Bell className="w-4 h-4" />
                {notifEnabled ? 'Вкл' : 'Выкл'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={async () => {
                  const next = !notifBusId;
                  setNotifBusId(next);
                  await saveNotifPrefs({ busId: next });
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
                  notifBusId ? 'bg-gray-900 text-white' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                Этот автобус
              </button>
              <button
                onClick={async () => {
                  const next = !notifBusNumber;
                  setNotifBusNumber(next);
                  await saveNotifPrefs({ busNumber: next });
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
                  notifBusNumber ? 'bg-gray-900 text-white' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                Все автобусы №{bus.bus_number}
              </button>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">Уведомлять по остановке</p>
              <StopSelector
                onSelect={(stop) => {
                  const next = [...notifStops.filter((s) => s.id !== stop.id), stop];
                  setNotifStops(next);
                  saveNotifPrefs({ stopIds: next.map((s) => s.id) });
                }}
                onAddNew={async (name, lat, lng) => {
                  const { data, error } = await supabase
                    .from('stops')
                    .insert({ name, latitude: lat, longitude: lng })
                    .select()
                    .single();
                  if (error || !data) return null;
                  return data as Stop;
                }}
                allowMapPickWithoutName
              />
              {notifStops.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {notifStops.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        const next = notifStops.filter((x) => x.id !== s.id);
                        setNotifStops(next);
                        saveNotifPrefs({ stopIds: next.map((x) => x.id) });
                      }}
                      className="px-2 py-1 rounded-xl bg-gray-200 dark:bg-gray-700 text-xs"
                    >
                      {s.name} ✕
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50 mb-2">
              {t('busProfile.reviews')}
            </h3>

            <div className="rounded-2xl bg-gray-50 dark:bg-gray-800 p-4 mb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Рейтинг по отзывам</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">
                    {avgRating}
                  </p>
                </div>
                <button
                  onClick={handleAiSummary}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-gray-900 text-white hover:bg-gray-800"
                  disabled={aiSummaryLoading || reviews.length === 0}
                >
                  {aiSummaryLoading ? 'AI анализ...' : 'AI анализ'}
                </button>
              </div>
              {aiSummary && (
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-300 whitespace-pre-line">
                  {aiSummary}
                </p>
              )}
            </div>

            <div className="flex space-x-2 mb-4 overflow-x-auto">
              <button
                onClick={() => setReviewFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap ${
                  reviewFilter === 'all'
                    ? 'bg-gray-900 dark:bg-gray-700 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {t('busProfile.all')}
              </button>
              <button
                onClick={() => setReviewFilter('positive')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap ${
                  reviewFilter === 'positive'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {t('busProfile.positive')}
              </button>
              <button
                onClick={() => setReviewFilter('negative')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap ${
                  reviewFilter === 'negative'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {t('busProfile.negative')}
              </button>
              {[5, 4, 3, 2, 1].map((rating) => (
                <button
                  key={rating}
                  onClick={() => setReviewFilter(rating)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center space-x-1 ${
                    reviewFilter === rating
                      ? 'bg-yellow-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <Star className="w-3 h-3 fill-current" />
                  <span>{rating}</span>
                </button>
              ))}
            </div>

            {user && !userReview && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 mb-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-50 mb-2">
                  {t('busProfile.writeReview')}
                </h4>
                <div className="flex space-x-1 mb-2">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      onClick={() => setNewReviewRating(rating)}
                      className={`${
                        newReviewRating >= rating
                          ? 'text-yellow-500 fill-current'
                          : 'text-gray-300 dark:text-gray-600'
                      }`}
                    >
                      <Star className="w-6 h-6" />
                    </button>
                  ))}
                </div>
                <textarea
                  value={newReviewComment}
                  onChange={(e) => setNewReviewComment(e.target.value)}
                  placeholder={t('busProfile.comment')}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-50 mb-2"
                  rows={2}
                />
                <button
                  onClick={handleSubmitReview}
                  disabled={!newReviewRating}
                  className="w-full px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-xl font-semibold hover:bg-gray-800 dark:hover:bg-gray-600 disabled:opacity-50"
                >
                  {t('common.save')}
                </button>
              </div>
            )}

            <div className="space-y-3">
              {filteredReviews.map((review) => (
                <div
                  key={review.id}
                  className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-white text-xs font-semibold">
                        {review.user?.first_name?.[0]}{review.user?.last_name?.[0]}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                          {review.user?.first_name} {review.user?.last_name}
                        </p>
                        <div className="flex space-x-1">
                          {[1, 2, 3, 4, 5].map((rating) => (
                            <Star
                              key={rating}
                              className={`w-3 h-3 ${
                                rating <= review.rating
                                  ? 'text-yellow-500 fill-current'
                                  : 'text-gray-300 dark:text-gray-600'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    {review.user_id === user?.id && (
                      <button
                        onClick={() => handleDeleteReview(review.id)}
                        className="text-red-500 hover:text-red-700 text-xs"
                      >
                        {t('common.delete')}
                      </button>
                    )}
                  </div>
                  {review.comment && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                      {review.comment}
                    </p>
                  )}
                  {review.comment && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(['ru', 'tj', 'eng'] as const).map((lang) => {
                        const k = `${review.id}_${lang}`;
                        return (
                          <button
                            key={k}
                            onClick={() => handleTranslateReview(review, lang)}
                            className="px-2 py-1 rounded-xl bg-gray-200 dark:bg-gray-700 text-xs"
                            disabled={translateLoading === k}
                          >
                            {translateLoading === k ? '...' : `Перевести ${lang.toUpperCase()}`}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {review.comment && (['ru', 'tj', 'eng'] as const).map((lang) => {
                    const k = `${review.id}_${lang}`;
                    return translations[k] ? (
                      <p key={k} className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        <span className="font-semibold">{lang.toUpperCase()}:</span> {translations[k]}
                      </p>
                    ) : null;
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
