import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, MapPin, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface BusLocation {
  latitude: number;
  longitude: number;
  timestamp: string;
}

interface Stop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  stop_order: number;
}

export default function TrackBus() {
  const { busId } = useParams();
  const navigate = useNavigate();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const busMarker = useRef<mapboxgl.Marker | null>(null);
  
  const [busLocation, setBusLocation] = useState<BusLocation | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [busInfo, setBusInfo] = useState<any>(null);
  const [mapboxToken, setMapboxToken] = useState('');

  useEffect(() => {
    loadBusInfo();
    loadStops();
    subscribeToLocationUpdates();
  }, [busId]);

  useEffect(() => {
    if (mapboxToken && mapContainer.current && !map.current) {
      initializeMap();
    }
  }, [mapboxToken]);

  useEffect(() => {
    if (map.current && busLocation) {
      updateBusMarker(busLocation);
    }
  }, [busLocation]);

  const initializeMap = () => {
    if (!mapContainer.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [78.4867, 17.3850], // Default: Hyderabad
      zoom: 12,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
  };

  const loadBusInfo = async () => {
    const { data, error } = await supabase
      .from('buses')
      .select('*, bus_routes(routes(*))')
      .eq('id', busId)
      .single();

    if (error) {
      toast.error('Failed to load bus information');
      return;
    }

    setBusInfo(data);
  };

  const loadStops = async () => {
    // Get route for this bus
    const { data: busRoute } = await supabase
      .from('bus_routes')
      .select('route_id')
      .eq('bus_id', busId)
      .single();

    if (!busRoute) return;

    const { data: stopsData } = await supabase
      .from('stops')
      .select('*')
      .eq('route_id', busRoute.route_id)
      .order('stop_order', { ascending: true });

    if (stopsData) {
      setStops(stopsData);
      // Add stop markers to map
      if (map.current) {
        stopsData.forEach((stop) => {
          new mapboxgl.Marker({ color: '#F59E0B' })
            .setLngLat([Number(stop.longitude), Number(stop.latitude)])
            .setPopup(new mapboxgl.Popup().setHTML(`<strong>${stop.name}</strong>`))
            .addTo(map.current!);
        });
      }
    }
  };

  const subscribeToLocationUpdates = () => {
    const channel = supabase
      .channel('bus-location-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bus_locations',
          filter: `bus_id=eq.${busId}`,
        },
        (payload) => {
          const newLocation = payload.new as BusLocation;
          setBusLocation(newLocation);
          
          // Check proximity to stops
          checkProximityToStops(newLocation);
        }
      )
      .subscribe();

    // Load latest location
    loadLatestLocation();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const loadLatestLocation = async () => {
    const { data } = await supabase
      .from('bus_locations')
      .select('*')
      .eq('bus_id', busId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (data) {
      setBusLocation(data);
    }
  };

  const updateBusMarker = (location: BusLocation) => {
    if (!map.current) return;

    const coords: [number, number] = [Number(location.longitude), Number(location.latitude)];

    if (busMarker.current) {
      busMarker.current.setLngLat(coords);
    } else {
      busMarker.current = new mapboxgl.Marker({ color: '#10B981' })
        .setLngLat(coords)
        .setPopup(new mapboxgl.Popup().setHTML('<strong>Your Bus</strong>'))
        .addTo(map.current);
    }

    // Center map on bus
    map.current.flyTo({
      center: coords,
      zoom: 14,
      essential: true,
    });
  };

  const checkProximityToStops = (location: BusLocation) => {
    const PROXIMITY_THRESHOLD = 0.005; // ~500 meters

    stops.forEach((stop) => {
      const distance = calculateDistance(
        Number(location.latitude),
        Number(location.longitude),
        Number(stop.latitude),
        Number(stop.longitude)
      );

      if (distance < PROXIMITY_THRESHOLD) {
        toast.info(`🚌 Bus approaching ${stop.name}`, {
          duration: 5000,
        });
      }
    });
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="bg-card border-b p-4">
        <div className="container mx-auto flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="text-center">
            <h1 className="text-xl font-bold">{busInfo?.bus_number || 'Loading...'}</h1>
            <p className="text-sm text-muted-foreground">Live Tracking</p>
          </div>
          <div className="w-20" />
        </div>
      </div>

      <div className="flex-1 relative">
        {!mapboxToken ? (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50 backdrop-blur-sm z-10">
            <Card className="max-w-md">
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <AlertCircle className="h-12 w-12 text-warning mx-auto" />
                  <div>
                    <h3 className="font-semibold mb-2">Mapbox Token Required</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Please enter your Mapbox public token to view the map.
                      Get one from{' '}
                      <a
                        href="https://mapbox.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        mapbox.com
                      </a>
                    </p>
                    <input
                      type="text"
                      placeholder="pk.eyJ1..."
                      className="w-full px-3 py-2 border rounded-md"
                      onChange={(e) => setMapboxToken(e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
        <div ref={mapContainer} className="w-full h-full" />
        
        {busLocation && (
          <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80">
            <Card className="shadow-lg">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Bus Status</h3>
                  <Badge className="bg-success">Live</Badge>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>Currently tracking...</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>Last update: {new Date(busLocation.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}