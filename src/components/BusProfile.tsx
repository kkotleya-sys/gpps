import { useState, useEffect, useRef } from 'react';
import { X, Star, Camera, Video, Edit2, Save } from 'lucide-react';
import * as THREE from 'three';
import { BusWithDriver, BusProfile as BusProfileType, BusMedia, Review, Route, RouteStop, Stop, Profile } from '../types';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

// Dynamic import for GLTFLoader to avoid SSR issues
let GLTFLoader: any = null;
if (typeof window !== 'undefined') {
  import('three/examples/jsm/loaders/GLTFLoader.js').then((module) => {
    GLTFLoader = module.GLTFLoader;
  });
}

interface BusProfileProps {
  bus: BusWithDriver;
  onClose: () => void;
  isDriver?: boolean;
}

export function BusProfile({ bus, onClose, isDriver }: BusProfileProps) {
  const { t } = useLanguage();
  const { user, profile: currentProfile } = useAuth();
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const busModelRef = useRef<THREE.Group | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    fetchBusProfile();
    fetchMedia();
    fetchReviews();
    fetchRoutes();
    fetchRouteStops();
    fetchStops();

    const profileChannel = supabase
      .channel('bus_profile_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bus_profiles' }, () => {
        fetchBusProfile();
      })
      .subscribe();

    const mediaChannel = supabase
      .channel('bus_media_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bus_media' }, () => {
        fetchMedia();
      })
      .subscribe();

    const reviewsChannel = supabase
      .channel('reviews_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, () => {
        fetchReviews();
      })
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
    if (!containerRef.current) return;

    // Initialize Three.js scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      50,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 2, 5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);

    // Load GLB model
    const loadModel = async () => {
      if (!GLTFLoader) {
        const loaderModule = await import('three/examples/jsm/loaders/GLTFLoader.js');
        GLTFLoader = loaderModule.GLTFLoader;
      }
      
      const loader = new GLTFLoader();
      loader.load(
        '/models/bus.glb',
        (gltf) => {
          const model = gltf.scene;
          model.scale.set(1, 1, 1);
          
          // Center the model
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          model.position.sub(center);
          
          scene.add(model);
          busModelRef.current = model;
        },
        (progress) => {
          // Loading progress
          if (progress.total > 0) {
            console.log('Loading progress:', (progress.loaded / progress.total) * 100 + '%');
          }
        },
        (error) => {
          console.error('Error loading model:', error);
          // Fallback: create a simple bus shape
          const geometry = new THREE.BoxGeometry(3, 2, 1.5);
          const material = new THREE.MeshStandardMaterial({ color: 0x3b82f6 });
          const bus = new THREE.Mesh(geometry, material);
          scene.add(bus);
          busModelRef.current = bus;
        }
      );
    };
    
    loadModel();

    // Mouse controls for rotation
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging || !busModelRef.current) return;

      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      busModelRef.current.rotation.y += deltaX * 0.01;
      busModelRef.current.rotation.x += deltaY * 0.01;

      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    // Wheel for zoom
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomSpeed = 0.1;
      const zoom = e.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;
      camera.position.multiplyScalar(zoom);
      camera.position.clampLength(2, 10);
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('mouseleave', onMouseUp);
    renderer.domElement.addEventListener('wheel', onWheel);

    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      if (busModelRef.current && !isDragging) {
        busModelRef.current.rotation.y += 0.005;
      }
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('mouseleave', onMouseUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
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

    if (busProfile) {
      await supabase
        .from('bus_profiles')
        .update({ description })
        .eq('id', busProfile.id);
    } else {
      await supabase.from('bus_profiles').insert({
        bus_number: bus.bus_number,
        driver_id: user.id,
        description,
      });
    }
    setEditing(false);
    fetchBusProfile();
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
      const fileExt = file.name.split('.').pop();
      const fileName = `${bus.bus_number}-${Date.now()}.${fileExt}`;
      const filePath = `bus-media/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('bus-media')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('bus-media').getPublicUrl(filePath);
      const mediaUrl = data.publicUrl;

      const currentMaxOrder = media
        .filter((m) => m.media_type === type)
        .reduce((max, m) => (m.order_index > max ? m.order_index : max), -1);

      await supabase.from('bus_media').insert({
        bus_number: bus.bus_number,
        media_type: type,
        media_url: mediaUrl,
        order_index: currentMaxOrder + 1,
      });

      fetchMedia();
    } catch (error) {
      console.error('Error uploading media:', error);
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!user || !newReviewRating) return;

    await supabase.from('reviews').insert({
      bus_number: bus.bus_number,
      user_id: user.id,
      rating: newReviewRating,
      comment: newReviewComment.trim() || null,
    });

    setNewReviewRating(0);
    setNewReviewComment('');
    fetchReviews();
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!user) return;
    await supabase.from('reviews').delete().eq('id', reviewId);
    fetchReviews();
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
          {/* 3D Model */}
          <div 
            ref={containerRef} 
            className="bg-white dark:bg-gray-800 rounded-2xl h-64 overflow-hidden relative"
            style={{ touchAction: 'none' }}
          />

          {/* Bus Info */}
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

          {/* Driver Profile */}
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

          {/* Description */}
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

          {/* Media */}
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
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add Media (Driver only) */}
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

          {/* Active Route */}
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

          {/* Reviews */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50 mb-2">
              {t('busProfile.reviews')}
            </h3>

            {/* Review Filters */}
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

            {/* Write Review */}
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

            {/* Reviews List */}
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
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
