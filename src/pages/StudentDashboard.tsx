import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bus, LogOut, MapPin, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface BusData {
  id: string;
  bus_number: string;
  driver_name: string;
  driver_phone: string;
}

export default function StudentDashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [buses, setBuses] = useState<BusData[]>([]);
  const [myBus, setMyBus] = useState<BusData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBuses();
    loadMyBus();
  }, [user]);

  const loadBuses = async () => {
    const { data, error } = await supabase
      .from('buses')
      .select('*')
      .eq('is_active', true);

    if (error) {
      toast.error('Failed to load buses');
      return;
    }

    setBuses(data || []);
    setLoading(false);
  };

  const loadMyBus = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('student_buses')
      .select('bus_id, buses(*)')
      .eq('student_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error loading student bus:', error);
      return;
    }

    if (data) {
      setMyBus(data.buses as unknown as BusData);
    }
  };

  const handleSelectBus = async (busId: string) => {
    if (!user) return;

    // Remove existing assignment
    await supabase
      .from('student_buses')
      .delete()
      .eq('student_id', user.id);

    // Add new assignment
    const { error } = await supabase
      .from('student_buses')
      .insert({ student_id: user.id, bus_id: busId });

    if (error) {
      toast.error('Failed to select bus');
      return;
    }

    toast.success('Bus selected successfully');
    loadMyBus();
  };

  const handleTrackBus = () => {
    if (myBus) {
      navigate(`/track/${myBus.id}`);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <div className="container mx-auto p-4 md:p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Student Dashboard</h1>
            <p className="text-muted-foreground">Track your college bus in real-time</p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>

        {myBus ? (
          <div className="mb-8">
            <Card className="border-primary/20 shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Bus className="h-5 w-5 text-primary" />
                      My Bus: {myBus.bus_number}
                    </CardTitle>
                    <CardDescription>
                      Driver: {myBus.driver_name} • {myBus.driver_phone}
                    </CardDescription>
                  </div>
                  <Badge className="bg-success">Active</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <Button onClick={handleTrackBus} className="w-full" size="lg">
                  <MapPin className="mr-2 h-4 w-4" />
                  Track Live Location
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="mb-8 border-warning/20">
            <CardHeader>
              <CardTitle>No Bus Selected</CardTitle>
              <CardDescription>
                Please select your bus from the list below to start tracking
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <div>
          <h2 className="text-2xl font-semibold mb-4">Available Buses</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {buses.map((bus) => (
              <Card key={bus.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bus className="h-5 w-5 text-primary" />
                    {bus.bus_number}
                  </CardTitle>
                  <CardDescription>
                    Driver: {bus.driver_name}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant={myBus?.id === bus.id ? 'default' : 'outline'}
                    className="w-full"
                    onClick={() => handleSelectBus(bus.id)}
                    disabled={myBus?.id === bus.id}
                  >
                    {myBus?.id === bus.id ? 'Selected' : 'Select Bus'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}