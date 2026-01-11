import { useState, useEffect } from 'react';
import { useHospitalSpecialties } from '@/hooks/useHospitalSpecialties';
import { EmergencyToken, useEmergencyTokens } from '@/hooks/useEmergencyTokens';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, MapPin, Clock, Route, Building2, User, Navigation, Heart } from 'lucide-react';
import Map from '@/components/Map';
import { toast } from 'sonner';

interface EmergencyDisplayProps {
  token: EmergencyToken;
  onAssignmentComplete?: () => void;
}

export default function EmergencyDisplay({ token, onAssignmentComplete }: EmergencyDisplayProps) {
  const { findBestHospitals } = useHospitalSpecialties();
  const { assignHospitalWithRoutes } = useEmergencyTokens();
  const [recommendations, setRecommendations] = useState<{
    best: any | null;
    nearest: any | null;
  }>({ best: null, nearest: null });
  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
    if (token.pickup_lat && token.pickup_lng) {
      // Use medical keyword if available, otherwise use emergency type, or default to 'Trauma'
      const keyword = token.medical_keyword || token.emergency_type || 'Trauma';
      const results = findBestHospitals(token.pickup_lat, token.pickup_lng, keyword);
      setRecommendations(results);
    }
  }, [token, findBestHospitals]);

  const handleAssignHospital = async (hospital: any, type: 'best' | 'nearest') => {
    if (!token.ambulance_origin_lat || !token.ambulance_origin_lng) {
      toast.error('Ambulance location not available');
      return;
    }

    setIsAssigning(true);
    try {
      // Mock route calculation (in real app, use routing service)
      const routeToPatient = {
        coordinates: [
          [token.ambulance_origin_lat, token.ambulance_origin_lng],
          [token.pickup_lat, token.pickup_lng]
        ] as [number, number][],
        distance: hospital.distance,
        duration: Math.floor(hospital.distance / 1000 * 60), // rough estimate
        type: 'fastest' as const
      };

      const routeToHospital = {
        coordinates: [
          [token.pickup_lat, token.pickup_lng],
          [hospital.hospital.location_lat, hospital.hospital.location_lng]
        ] as [number, number][],
        distance: hospital.distance,
        duration: Math.floor(hospital.distance / 1000 * 60),
        type: 'fastest' as const
      };

      const success = await assignHospitalWithRoutes(
        token.id,
        hospital.hospital.id,
        hospital.hospital.organization_name,
        hospital.hospital.location_lat,
        hospital.hospital.location_lng,
        routeToPatient,
        routeToHospital
      );

      if (success) {
        toast.success(`${type === 'best' ? 'Best Specialist' : 'Nearest'} Hospital Assigned!`, {
          description: `${hospital.hospital.organization_name} - Routes calculated`
        });
        // Redirect back to dashboard after successful assignment
        if (onAssignmentComplete) {
          setTimeout(() => onAssignmentComplete(), 1500);
        }
      } else {
        toast.error('Failed to assign hospital');
      }
    } catch (error) {
      console.error('Error assigning hospital:', error);
      toast.error('Failed to assign hospital');
    } finally {
      setIsAssigning(false);
    }
  };

  const getEmergencyIcon = (type: string) => {
    const icons: Record<string, string> = {
      'Cardiac Emergency (Heart Attack)': '❤️',
      'Accident / Trauma': '🚗',
      'Stroke / Neurological Emergency': '🧠',
      'Cancer-related Emergency': '🎗️',
      'Pregnancy / Delivery': '👶',
      'Respiratory Distress': '🫁',
      'Pediatric Emergency': '👶',
      'General Emergency': '🏥'
    };
    return icons[type] || '🚨';
  };

  const formatDistance = (meters: number) => (meters / 1000).toFixed(1) + ' km';
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <div className="space-y-6">
      {/* Emergency Header */}
      <Card className="border-emergency bg-emergency/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emergency/20 rounded-full flex items-center justify-center">
                <span className="text-2xl">{getEmergencyIcon(token.emergency_type || '')}</span>
              </div>
              <div>
                <CardTitle className="text-emergency">
                  Emergency Token: {token.token_code}
                </CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="destructive">{token.emergency_type || 'General Emergency'}</Badge>
                  {token.medical_keyword && <Badge variant="outline">{token.medical_keyword}</Badge>}
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Created</p>
              <p className="font-medium">{new Date(token.created_at).toLocaleTimeString()}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <span>Patient Location: {token.pickup_address || `${token.pickup_lat.toFixed(4)}, ${token.pickup_lng.toFixed(4)}`}</span>
          </div>
        </CardContent>
      </Card>

      {/* Hospital Recommendations */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Best Specialist Hospital */}
        <Card className="border-green-500/30 bg-green-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <Building2 className="w-5 h-5" />
              Best Specialist Hospital
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {recommendations.best ? (
              <>
                <div>
                  <h3 className="font-semibold text-lg">{recommendations.best.hospital.organization_name}</h3>
                  <p className="text-sm text-muted-foreground">{recommendations.best.hospital.address}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {recommendations.best.specialties.map((specialty: string) => (
                      <Badge key={specialty} variant="secondary">{specialty}</Badge>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Match Score:</span>
                    <Badge variant="default">{recommendations.best.matchScore.toFixed(0)}/100</Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Distance:</span>
                    <span>{formatDistance(recommendations.best.distance)}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Reason: </span>
                    <span className="font-medium">{recommendations.best.reason}</span>
                  </div>
                </div>

                <Button 
                  className="w-full bg-green-600 hover:bg-green-700"
                  disabled={isAssigning}
                  onClick={() => handleAssignHospital(recommendations.best, 'best')}
                >
                  <Heart className="w-4 h-4 mr-2" />
                  {isAssigning ? 'Assigning...' : 'Assign Best Hospital'}
                </Button>
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-muted-foreground">Analyzing hospitals...</p>
                <div className="text-xs text-muted-foreground">
                  Emergency: {token.emergency_type || 'General'} | 
                  Keyword: {token.medical_keyword || 'None'} | 
                  Location: {token.pickup_lat?.toFixed(4)}, {token.pickup_lng?.toFixed(4)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Nearest Hospital */}
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-600">
              <Navigation className="w-5 h-5" />
              Nearest Hospital
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {recommendations.nearest ? (
              <>
                <div>
                  <h3 className="font-semibold text-lg">{recommendations.nearest.hospital.organization_name}</h3>
                  <p className="text-sm text-muted-foreground">{recommendations.nearest.hospital.address}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {recommendations.nearest.specialties.map((specialty: string) => (
                      <Badge key={specialty} variant="outline">{specialty}</Badge>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Distance:</span>
                    <Badge variant="secondary">{formatDistance(recommendations.nearest.distance)}</Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Match Score:</span>
                    <span>{recommendations.nearest.matchScore.toFixed(0)}/100</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Reason: </span>
                    <span className="font-medium">Closest by distance</span>
                  </div>
                </div>

                <Button 
                  variant="outline"
                  className="w-full border-blue-500 text-blue-600 hover:bg-blue-50"
                  disabled={isAssigning}
                  onClick={() => handleAssignHospital(recommendations.nearest, 'nearest')}
                >
                  <Clock className="w-4 h-4 mr-2" />
                  {isAssigning ? 'Assigning...' : 'Assign Nearest Hospital'}
                </Button>
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-muted-foreground">Calculating distance...</p>
                <div className="text-xs text-muted-foreground">
                  Hospitals loaded: {recommendations.best ? 'Yes' : 'No'}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Live Map */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Emergency Location & Hospitals
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[400px] rounded-b-xl overflow-hidden">
            <Map
              center={[token.pickup_lat, token.pickup_lng]}
              zoom={12}
              markers={[
                // Patient location
                {
                  position: [token.pickup_lat, token.pickup_lng] as [number, number],
                  popup: `${token.emergency_type} - Patient Location`,
                  icon: 'signal' as const
                },
                // Best hospital
                ...(recommendations.best ? [{
                  position: [recommendations.best.hospital.location_lat, recommendations.best.hospital.location_lng] as [number, number],
                  popup: `Best: ${recommendations.best.hospital.organization_name}`,
                  icon: 'hospital' as const
                }] : []),
                // Nearest hospital (if different)
                ...(recommendations.nearest && recommendations.nearest.hospital.id !== recommendations.best?.hospital.id ? [{
                  position: [recommendations.nearest.hospital.location_lat, recommendations.nearest.hospital.location_lng] as [number, number],
                  popup: `Nearest: ${recommendations.nearest.hospital.organization_name}`,
                  icon: 'hospital' as const
                }] : [])
              ]}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}