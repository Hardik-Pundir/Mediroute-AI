import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAmbulance } from '@/hooks/useAmbulance';
import { useTrafficSignals } from '@/hooks/useTrafficSignals';
import { useEmergencyTokens } from '@/hooks/useEmergencyTokens';
import { useHospitals } from '@/hooks/useHospitals';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, LogOut } from 'lucide-react';
import MediBot from '@/components/medibot';
import { toast } from 'sonner';

// Feature components
import { EmergencyBroadcastAlert } from '../features/ambulance-dashboard/components/EmergencyBroadcastAlert';
import { EmergencyTokenDisplay } from '../features/ambulance-dashboard/components/EmergencyTokenDisplay';
import { EmergencyCreationForm } from '../features/ambulance-dashboard/components/EmergencyCreationForm';
import { AmbulanceStatus } from '../features/ambulance-dashboard/components/AmbulanceStatus';
import { VehicleHealth } from '../features/ambulance-dashboard/components/VehicleHealth';
import { AmbulanceMap } from '../features/ambulance-dashboard/components/AmbulanceMap';

// Feature hooks
import { useGeolocation } from '../features/ambulance-dashboard/hooks/useGeolocation';
import { useEmergencyBroadcast } from '../features/ambulance-dashboard/hooks/useEmergencyBroadcast';

// Types
import { PickupLocation, EmergencyType } from '../features/ambulance-dashboard/types';

export default function AmbulanceDashboard() {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const { ambulance, loading: ambLoading, updateLocation, isSimulating, startSimulation, stopSimulation } = useAmbulance();
  const { signals, checkSignalsForAmbulance } = useTrafficSignals();
  const { hospitals } = useHospitals();
  
  const { 
    activeToken, 
    createToken,
    startJourney, 
    arrivedAtPatient, 
    startToHospital, 
    completeEmergency, 
    cancelEmergency
  } = useEmergencyTokens();
  
  // Feature hooks
  const { emergencyBroadcast, showBroadcast, setShowBroadcast } = useEmergencyBroadcast();
  const { watchId } = useGeolocation(ambulance, activeToken?.status, updateLocation);
  
  // Emergency creation state
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [pickupLocation, setPickupLocation] = useState<PickupLocation | null>(null);
  const [isCreatingToken, setIsCreatingToken] = useState(false);

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  // Check signals when ambulance moves during active journey
  useEffect(() => {
    if (ambulance && (activeToken?.status === 'in_progress' || activeToken?.status === 'to_hospital')) {
      checkSignalsForAmbulance(ambulance);
    }
  }, [ambulance?.current_lat, ambulance?.current_lng, activeToken?.status]);

  // Simulated movement
  useEffect(() => {
    if (!isSimulating || !ambulance) return;

    const interval = setInterval(() => {
      const newLat = ambulance.current_lat + (Math.random() - 0.3) * 0.001;
      const newLng = ambulance.current_lng + (Math.random() - 0.3) * 0.001;
      const heading = Math.random() * 360;
      const speed = 40 + Math.random() * 30;
      updateLocation(newLat, newLng, heading, speed);
    }, 2000);

    return () => clearInterval(interval);
  }, [isSimulating, ambulance]);

  const handleLocationSelect = (lat: number, lng: number, address?: string) => {
    setPickupLocation({ lat, lng, address });
    setShowLocationPicker(false); // Auto-hide map selection after selection
    toast.success('Location selected on map');
  };

  const handleCreateToken = async (location: PickupLocation, emergencyType: string, customType?: string) => {
    if (!ambulance) {
      toast.error('Ambulance not available');
      return;
    }

    setIsCreatingToken(true);
    try {
      const token = await createToken(
        ambulance.id,
        location.lat,
        location.lng,
        location.address,
        ambulance.current_lat,
        ambulance.current_lng
      );

      if (token) {
        const displayType = emergencyType === 'custom' ? customType : emergencyType;
        toast.success(`Emergency Created: ${token.token_code}`, {
          description: `${displayType}`
        });
        setShowLocationPicker(false);
        setPickupLocation(null);
      } else {
        toast.error('Failed to create emergency token');
      }
    } catch (error) {
      console.error('Token creation error:', error);
      toast.error('Failed to create emergency token');
    } finally {
      setIsCreatingToken(false);
    }
  };

  const handleStartJourney = async () => {
    if (!activeToken) return;
    const success = await startJourney(activeToken.id);
    if (success) {
      toast.success('Journey Started!', {
        description: 'Heading to patient location. Green corridor is now active.'
      });
    }
  };

  const handleArrivedAtPatient = async () => {
    if (!activeToken) return;
    const success = await arrivedAtPatient(activeToken.id);
    if (success) {
      toast.success('Arrived at Patient Location!', {
        description: 'Patient pickup confirmed.'
      });
    }
  };

  const handleStartToHospital = async () => {
    if (!activeToken) return;
    const success = await startToHospital(activeToken.id);
    if (success) {
      toast.success('Heading to Hospital!', {
        description: 'Green corridor active for hospital route.'
      });
    }
  };

  const handleCompleteEmergency = async () => {
    if (!activeToken || !ambulance) return;
    const success = await completeEmergency(activeToken.id, ambulance.id);
    if (success) {
      toast.success('Arrived at Hospital - Emergency Completed!');
    }
  };

  const handleCancelEmergency = async () => {
    if (!activeToken || !ambulance) return;
    const success = await cancelEmergency(activeToken.id, ambulance.id);
    if (success) {
      toast.info('Emergency Cancelled');
    }
  };

  if (authLoading || ambLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const hasActiveEmergency = !!activeToken;

  // Get current route based on status
  const getCurrentRoute = () => {
    if (activeToken?.status === 'to_hospital') {
      return activeToken?.route_to_hospital;
    }
    if (activeToken?.route_to_patient) {
      return activeToken.route_to_patient;
    }
    return activeToken?.selected_route || null;
  };

  // Build map markers
  const mapMarkers = [
    ...(ambulance ? [{
      position: [ambulance.current_lat, ambulance.current_lng] as [number, number],
      popup: `Ambulance ${ambulance.vehicle_number}`,
      icon: 'ambulance' as const
    }] : []),
    ...signals.map(signal => ({
      position: [signal.location_lat, signal.location_lng] as [number, number],
      popup: signal.signal_name,
      icon: 'signal' as const
    })),
    ...hospitals.map(hospital => ({
      position: [hospital.location_lat, hospital.location_lng] as [number, number],
      popup: hospital.organization_name,
      icon: 'hospital' as const
    })),
    ...(activeToken?.pickup_lat && activeToken?.pickup_lng ? [{
      position: [activeToken.pickup_lat, activeToken.pickup_lng] as [number, number],
      popup: 'Patient Pickup',
      icon: 'signal' as const
    }] : []),
    ...(activeToken?.hospital_lat && activeToken?.hospital_lng ? [{
      position: [activeToken.hospital_lat, activeToken.hospital_lng] as [number, number],
      popup: activeToken.hospital_name || 'Hospital',
      icon: 'hospital' as const
    }] : [])
  ];

  const emergencyCreationMarkers = [
    ...(ambulance ? [{
      position: [ambulance.current_lat, ambulance.current_lng] as [number, number],
      popup: `Ambulance ${ambulance.vehicle_number}`,
      icon: 'ambulance' as const
    }] : []),
    ...hospitals.map(hospital => ({
      position: [hospital.location_lat, hospital.location_lng] as [number, number],
      popup: hospital.organization_name,
      icon: 'hospital' as const
    })),
    ...(pickupLocation ? [{
      position: [pickupLocation.lat, pickupLocation.lng] as [number, number],
      popup: 'Patient Pickup Location',
      icon: 'signal' as const,
      highlighted: true
    }] : [])
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Emergency Broadcast Alert */}
      {showBroadcast && emergencyBroadcast && (
        <EmergencyBroadcastAlert
          message={emergencyBroadcast}
          onClose={() => setShowBroadcast(false)}
        />
      )}

      {/* Header */}
      <nav className={`border-b px-4 py-3 transition-colors ${hasActiveEmergency ? 'bg-emergency/10 border-emergency/30' : 'bg-card border-border'}`}>
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2 sm:gap-3">
            <AlertTriangle className={`w-5 h-5 sm:w-6 sm:h-6 ${hasActiveEmergency ? 'text-emergency animate-pulse' : 'text-muted-foreground'}`} />
            <div>
              <span className="font-bold text-sm sm:text-base">Ambulance Dashboard</span>
              <Badge variant="outline" className="ml-2 text-xs">{ambulance?.vehicle_number}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Button variant="outline" size="sm" onClick={() => navigate('/')} className="hidden sm:inline-flex">
              Dashboard
            </Button>
            <span className="text-xs sm:text-sm text-muted-foreground hidden md:block">{profile?.full_name || profile?.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline ml-2">Sign Out</span>
            </Button>
          </div>
        </div>
      </nav>

      <div className="container mx-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
        {/* MediBot AI Assistant */}
        <div className="fixed bottom-6 right-6 z-[9999]">
          <MediBot />
        </div>

        {/* Active Emergency Token Display */}
        {hasActiveEmergency && (
          <EmergencyTokenDisplay
            activeToken={activeToken}
            ambulance={ambulance}
            onStartJourney={handleStartJourney}
            onArrivedAtPatient={handleArrivedAtPatient}
            onStartToHospital={handleStartToHospital}
            onCompleteEmergency={handleCompleteEmergency}
            onCancelEmergency={handleCancelEmergency}
          />
        )}

        {/* Create New Emergency */}
        {!hasActiveEmergency && (
          <EmergencyCreationForm
            onCreateToken={handleCreateToken}
            onCancel={() => {
              setShowLocationPicker(false);
              setPickupLocation(null);
            }}
            isCreating={isCreatingToken}
            onEnableMapSelection={() => setShowLocationPicker(true)}
            pickupLocation={pickupLocation}
          />
        )}

        {/* Location & Status */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <div className="space-y-4">
            <AmbulanceStatus
              ambulance={ambulance}
              isSimulating={isSimulating}
              onStartSimulation={startSimulation}
              onStopSimulation={stopSimulation}
              onUpdateLocation={updateLocation}
            />
            <VehicleHealth ambulance={ambulance} />
          </div>

          <AmbulanceMap
            ambulance={ambulance}
            showLocationPicker={showLocationPicker}
            pickupLocation={pickupLocation}
            mapMarkers={showLocationPicker ? emergencyCreationMarkers : mapMarkers}
            currentRoute={getCurrentRoute()}
            onLocationSelect={showLocationPicker ? handleLocationSelect : undefined}
            onLocationUpdate={(lat, lng) => updateLocation(lat, lng, 0, 0)}
          />
        </div>
      </div>
    </div>
  );
}