import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface RouteData {
  coordinates: [number, number][];
  distance: number;
  duration: number;
  type: 'shortest' | 'fastest';
}

export interface EmergencyToken {
  id: string;
  token_code: string;
  ambulance_id: string;
  // Ambulance origin (where ambulance was when token was created)
  ambulance_origin_lat: number | null;
  ambulance_origin_lng: number | null;
  // Patient pickup
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string | null;
  // Hospital
  hospital_id: string | null;
  hospital_name: string | null;
  hospital_lat: number | null;
  hospital_lng: number | null;
  // Emergency type information
  emergency_type: string | null;
  medical_keyword: string | null;
  // Route to patient (leg 1)
  route_to_patient: RouteData | null;
  route_to_patient_distance_meters: number | null;
  route_to_patient_duration_seconds: number | null;
  arrived_at_patient_at: string | null;
  // Route to hospital (leg 2)
  route_to_hospital: RouteData | null;
  route_to_hospital_distance_meters: number | null;
  route_to_hospital_duration_seconds: number | null;
  // Legacy fields (for backwards compatibility)
  selected_route: RouteData | null;
  route_type: string | null;
  route_distance_meters: number | null;
  route_duration_seconds: number | null;
  // Status
  status: 'pending' | 'assigned' | 'route_selected' | 'in_progress' | 'at_patient' | 'to_hospital' | 'completed' | 'cancelled' | 'declined';
  decline_reason: string | null;
  created_at: string;
  assigned_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export function useEmergencyTokens() {
  const { user, profile } = useAuth();
  const [tokens, setTokens] = useState<EmergencyToken[]>([]);
  const [activeToken, setActiveToken] = useState<EmergencyToken | null>(null);
  const [loading, setLoading] = useState(true);

  const isAmbulanceDriver = profile?.role === 'ambulance';
  const isHospitalUser = profile?.role === 'hospital';

  const normalizeToken = (token: any): EmergencyToken => ({
    ...token,
    route_to_patient: token.route_to_patient as unknown as RouteData | null,
    route_to_hospital: token.route_to_hospital as unknown as RouteData | null,
    selected_route: token.selected_route as unknown as RouteData | null,
    status: token.status as EmergencyToken['status'],
  });

  const ACTIVE_TOKEN_STATUSES: EmergencyToken['status'][] = [
    'pending',
    'assigned',
    'route_selected',
    'in_progress',
    'at_patient',
    'to_hospital',
  ];

  const findActiveToken = (list: EmergencyToken[], ambulanceId?: string) => {
    if (ambulanceId) {
      // For ambulance drivers, find active token for their specific ambulance
      return list.find((t) => 
        ACTIVE_TOKEN_STATUSES.includes(t.status) && t.ambulance_id === ambulanceId
      ) ?? null;
    }
    // For hospital users, find any active token
    return list.find((t) => ACTIVE_TOKEN_STATUSES.includes(t.status)) ?? null;
  };

  // Fetch tokens based on user role
  const fetchTokens = useCallback(async () => {
    if (!user) return;

    try {
      let query = supabase
        .from('emergency_tokens')
        .select('*')
        .order('created_at', { ascending: false });

      // Filter tokens based on user role
      if (isAmbulanceDriver) {
        // Ambulance drivers only see tokens for their ambulance
        const { data: ambulanceData } = await supabase
          .from('ambulances')
          .select('id')
          .eq('driver_id', user.id)
          .single();
        
        if (ambulanceData) {
          query = query.eq('ambulance_id', ambulanceData.id);
        } else {
          // No ambulance assigned to this driver
          setTokens([]);
          setActiveToken(null);
          setLoading(false);
          return;
        }
      }
      // Hospital users see all tokens (for now)

      const { data, error } = await query;

      if (error) throw error;
      
      const typedData = (data || []).map(normalizeToken);
      setTokens(typedData);

      // For ambulance drivers, find active token for their ambulance only
      const active = isAmbulanceDriver && ambulanceData
        ? findActiveToken(typedData, ambulanceData.id)
        : findActiveToken(typedData);
      setActiveToken(active);

    } catch (error) {
      console.error('Error fetching tokens:', error);
    } finally {
      setLoading(false);
    }
  }, [user, isAmbulanceDriver]);

  useEffect(() => {
    fetchTokens();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('emergency-tokens')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'emergency_tokens',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newToken = normalizeToken(payload.new);
            
            // Filter realtime updates based on user role
            if (isAmbulanceDriver) {
              // Only show tokens for this ambulance driver's ambulance
              supabase
                .from('ambulances')
                .select('id')
                .eq('driver_id', user?.id)
                .single()
                .then(({ data: ambulanceData }) => {
                  if (ambulanceData && newToken.ambulance_id === ambulanceData.id) {
                    setTokens((prev) => {
                      const next = [newToken, ...prev];
                      setActiveToken(findActiveToken(next, ambulanceData.id));
                      return next;
                    });
                  }
                });
            } else {
              // Hospital users see all tokens
              setTokens((prev) => {
                const next = [newToken, ...prev];
                setActiveToken(findActiveToken(next));
                return next;
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedToken = normalizeToken(payload.new);

            // If a hospital declines, clear the ambulance's active emergency (ambulance driver has permission to update their own ambulance).
            if (isAmbulanceDriver && updatedToken.status === 'declined') {
              supabase
                .from('ambulances')
                .update({ active_token_id: null, emergency_status: 'inactive' })
                .eq('id', updatedToken.ambulance_id)
                .eq('active_token_id', updatedToken.id)
                .then(({ error }) => {
                  if (error) console.error('Error clearing ambulance after decline:', error);
                });
            }

            // Only update existing tokens, never add new ones via UPDATE event
            setTokens((prev) => {
              const next = prev.map((t) => (t.id === updatedToken.id ? updatedToken : t));
              // For ambulance drivers, pass their ambulance ID to findActiveToken
              if (isAmbulanceDriver) {
                supabase
                  .from('ambulances')
                  .select('id')
                  .eq('driver_id', user?.id)
                  .single()
                  .then(({ data: ambulanceData }) => {
                    if (ambulanceData) {
                      setActiveToken(findActiveToken(next, ambulanceData.id));
                    }
                  });
              } else {
                setActiveToken(findActiveToken(next));
              }
              return next;
            });
          } else if (payload.eventType === 'DELETE') {
            setTokens((prev) => {
              const next = prev.filter((t) => t.id !== payload.old.id);
              setActiveToken(findActiveToken(next));
              return next;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTokens, isAmbulanceDriver]);

  // Create new emergency token with ambulance origin location
  const createToken = async (
    ambulanceId: string,
    pickupLat: number,
    pickupLng: number,
    pickupAddress?: string,
    ambulanceOriginLat?: number,
    ambulanceOriginLng?: number
  ): Promise<EmergencyToken | null> => {
    if (!isAmbulanceDriver) {
      console.error('Only ambulance drivers can create tokens');
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('emergency_tokens')
        .insert({
          ambulance_id: ambulanceId,
          pickup_lat: pickupLat,
          pickup_lng: pickupLng,
          pickup_address: pickupAddress || null,
          ambulance_origin_lat: ambulanceOriginLat || null,
          ambulance_origin_lng: ambulanceOriginLng || null,
          status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;

      // Update ambulance with active token
      await supabase
        .from('ambulances')
        .update({ 
          active_token_id: data.id,
          emergency_status: 'active'
        })
        .eq('id', ambulanceId);

      const typedToken = {
        ...data,
        route_to_patient: data.route_to_patient as unknown as RouteData | null,
        route_to_hospital: data.route_to_hospital as unknown as RouteData | null,
        selected_route: data.selected_route as unknown as RouteData | null,
        status: data.status as EmergencyToken['status']
      } as EmergencyToken;

      return typedToken;
    } catch (error) {
      console.error('Error creating token:', error);
      return null;
    }
  };

  // Hospital creates emergency token and assigns ambulance with auto-route calculation
  const createHospitalEmergency = async (
    ambulanceId: string,
    ambulanceLat: number,
    ambulanceLng: number,
    pickupLat: number,
    pickupLng: number,
    pickupAddress: string | undefined,
    hospitalId: string,
    hospitalName: string,
    hospitalLat: number,
    hospitalLng: number,
    routeToPatient: RouteData,
    routeToHospital: RouteData,
    emergencyType?: string,
    medicalKeyword?: string
  ): Promise<EmergencyToken | null> => {
    if (!isHospitalUser) {
      console.error('Only hospital users can create hospital emergencies');
      return null;
    }

    try {
      // Check if ambulance already has an active token in database
      const { data: existingTokens, error: checkError } = await supabase
        .from('emergency_tokens')
        .select('id, token_code, status')
        .eq('ambulance_id', ambulanceId)
        .in('status', ['pending', 'assigned', 'route_selected', 'in_progress', 'at_patient', 'to_hospital']);
      
      if (checkError) throw checkError;
      
      if (existingTokens && existingTokens.length > 0) {
        console.error('Ambulance already has an active emergency token:', existingTokens[0].token_code);
        return null;
      }

      const isUuid = (value: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

      const resolvedHospitalId = isUuid(hospitalId) ? hospitalId : user?.id ?? null;

      // Create token with all data filled in
      const insertData: any = {
        ambulance_id: ambulanceId,
        pickup_lat: pickupLat,
        pickup_lng: pickupLng,
        pickup_address: pickupAddress || null,
        ambulance_origin_lat: ambulanceLat,
        ambulance_origin_lng: ambulanceLng,
        hospital_id: resolvedHospitalId,
        hospital_name: hospitalName,
        hospital_lat: hospitalLat,
        hospital_lng: hospitalLng,
        route_to_patient: JSON.parse(JSON.stringify(routeToPatient)),
        route_to_patient_distance_meters: routeToPatient.distance,
        route_to_patient_duration_seconds: routeToPatient.duration,
        route_to_hospital: JSON.parse(JSON.stringify(routeToHospital)),
        route_to_hospital_distance_meters: routeToHospital.distance,
        route_to_hospital_duration_seconds: routeToHospital.duration,
        selected_route: JSON.parse(JSON.stringify(routeToPatient)),
        route_type: routeToPatient.type,
        route_distance_meters: routeToPatient.distance + routeToHospital.distance,
        route_duration_seconds: routeToPatient.duration + routeToHospital.duration,
        status: 'route_selected',
        assigned_at: new Date().toISOString()
      };

      // Add emergency type fields if provided
      if (emergencyType) insertData.emergency_type = emergencyType;
      if (medicalKeyword) insertData.medical_keyword = medicalKeyword;

      const { data, error } = await supabase
        .from('emergency_tokens')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      // Update ambulance with active token
      await supabase
        .from('ambulances')
        .update({ 
          active_token_id: data.id,
          emergency_status: 'active'
        })
        .eq('id', ambulanceId);

      const typedToken = {
        ...data,
        route_to_patient: data.route_to_patient as unknown as RouteData | null,
        route_to_hospital: data.route_to_hospital as unknown as RouteData | null,
        selected_route: data.selected_route as unknown as RouteData | null,
        status: data.status as EmergencyToken['status']
      } as EmergencyToken;

      return typedToken;
    } catch (error) {
      console.error('Error creating hospital emergency:', error);
      return null;
    }
  };

  const assignHospitalWithRoutes = async (
    tokenId: string,
    hospitalId: string,
    hospitalName: string,
    hospitalLat: number,
    hospitalLng: number,
    routeToPatient: RouteData,
    routeToHospital: RouteData
  ) => {
    try {
      if (!user) {
        console.error('You must be logged in to assign routes');
        return false;
      }

      const isUuid = (value: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

      const resolvedHospitalId = isUuid(hospitalId) ? hospitalId : user.id;

      // IMPORTANT: request the updated row back. If RLS blocks the update (0 rows),
      // supabase-js can otherwise return success with no error.
      const { data, error } = await supabase
        .from('emergency_tokens')
        .update({
          hospital_id: resolvedHospitalId,
          hospital_name: hospitalName,
          hospital_lat: hospitalLat,
          hospital_lng: hospitalLng,
          // Route to patient (leg 1)
          route_to_patient: JSON.parse(JSON.stringify(routeToPatient)),
          route_to_patient_distance_meters: routeToPatient.distance,
          route_to_patient_duration_seconds: routeToPatient.duration,
          // Route to hospital (leg 2)
          route_to_hospital: JSON.parse(JSON.stringify(routeToHospital)),
          route_to_hospital_distance_meters: routeToHospital.distance,
          route_to_hospital_duration_seconds: routeToHospital.duration,
          // Also set legacy fields for compatibility
          selected_route: JSON.parse(JSON.stringify(routeToPatient)),
          route_type: routeToPatient.type,
          route_distance_meters: routeToPatient.distance + routeToHospital.distance,
          route_duration_seconds: routeToPatient.duration + routeToHospital.duration,
          status: 'route_selected',
          assigned_at: new Date().toISOString(),
        })
        .eq('id', tokenId)
        .select('*')
        .single();

      if (error || !data) throw error;

      // Immediately update local state to ensure UI reflects changes
      const updated = normalizeToken(data);
      setTokens((prev) => {
        const next = prev.map((t) => (t.id === updated.id ? updated : t));
        setActiveToken(findActiveToken(next));
        return next;
      });

      return true;
    } catch (error) {
      console.error('Error assigning hospital with routes:', error);
      return false;
    }
  };

  // Legacy: Assign hospital to token
  const assignHospital = async (
    tokenId: string,
    hospitalId: string,
    hospitalName: string,
    hospitalLat: number,
    hospitalLng: number
  ) => {
    try {
      const { error } = await supabase
        .from('emergency_tokens')
        .update({
          hospital_id: hospitalId,
          hospital_name: hospitalName,
          hospital_lat: hospitalLat,
          hospital_lng: hospitalLng,
          status: 'assigned',
          assigned_at: new Date().toISOString()
        })
        .eq('id', tokenId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error assigning hospital:', error);
      return false;
    }
  };

  // Set route for token (hospital selects route)
  const setRoute = async (
    tokenId: string,
    route: RouteData
  ) => {
    try {
      const routeJson = JSON.parse(JSON.stringify(route));
      const { error } = await supabase
        .from('emergency_tokens')
        .update({
          selected_route: routeJson,
          route_type: route.type,
          route_distance_meters: route.distance,
          route_duration_seconds: route.duration,
          status: 'route_selected'
        })
        .eq('id', tokenId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error setting route:', error);
      return false;
    }
  };

  // Start journey to patient (ambulance driver)
  const startJourney = async (tokenId: string) => {
    try {
      const { error } = await supabase
        .from('emergency_tokens')
        .update({
          status: 'in_progress',
          started_at: new Date().toISOString()
        })
        .eq('id', tokenId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error starting journey:', error);
      return false;
    }
  };

  // Mark arrived at patient location
  const arrivedAtPatient = async (tokenId: string) => {
    try {
      const { error } = await supabase
        .from('emergency_tokens')
        .update({
          status: 'at_patient',
          arrived_at_patient_at: new Date().toISOString()
        })
        .eq('id', tokenId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error marking arrival at patient:', error);
      return false;
    }
  };

  // Start journey to hospital (after picking up patient)
  const startToHospital = async (tokenId: string) => {
    try {
      const { error } = await supabase
        .from('emergency_tokens')
        .update({
          status: 'to_hospital'
        })
        .eq('id', tokenId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error starting journey to hospital:', error);
      return false;
    }
  };

  // Complete emergency (arrived at hospital)
  const completeEmergency = async (tokenId: string, ambulanceId: string) => {
    try {
      // Update token status to completed
      await supabase
        .from('emergency_tokens')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', tokenId);

      // Clear ambulance active token and set to inactive
      await supabase
        .from('ambulances')
        .update({
          active_token_id: null,
          emergency_status: 'inactive'
        })
        .eq('id', ambulanceId);

      // Immediately clear active token in local state
      setActiveToken(null);
      
      // Refresh tokens to ensure clean state
      await fetchTokens();
      
      return true;
    } catch (error) {
      console.error('Error completing emergency:', error);
      return false;
    }
  };

  // Cancel emergency
  const cancelEmergency = async (tokenId: string, ambulanceId: string) => {
    try {
      // Update token status to cancelled
      await supabase
        .from('emergency_tokens')
        .update({
          status: 'cancelled'
        })
        .eq('id', tokenId);

      // Clear ambulance active token and set to inactive
      await supabase
        .from('ambulances')
        .update({
          active_token_id: null,
          emergency_status: 'inactive'
        })
        .eq('id', ambulanceId);

      // Immediately clear active token in local state
      setActiveToken(null);
      
      // Refresh tokens to ensure clean state
      await fetchTokens();
      
      return true;
    } catch (error) {
      console.error('Error cancelling emergency:', error);
      return false;
    }
  };

  // Release ambulance from duty (hospital can make on-duty ambulance available)
  const releaseAmbulance = async (ambulanceId: string) => {
    try {
      // Find any active token for this ambulance
      const activeAmbulanceToken = tokens.find(
        t => t.ambulance_id === ambulanceId && 
        ['pending', 'assigned', 'route_selected', 'in_progress', 'at_patient', 'to_hospital'].includes(t.status)
      );

      // If there's an active token, cancel it
      if (activeAmbulanceToken) {
        await supabase
          .from('emergency_tokens')
          .update({ status: 'cancelled' })
          .eq('id', activeAmbulanceToken.id);
      }

      // Update ambulance status to inactive
      const { error } = await supabase
        .from('ambulances')
        .update({
          active_token_id: null,
          emergency_status: 'inactive'
        })
        .eq('id', ambulanceId);

      if (error) throw error;

      // Refresh tokens to update UI
      await fetchTokens();
      return true;
    } catch (error) {
      console.error('Error releasing ambulance:', error);
      return false;
    }
  };

  // Decline emergency request (hospital declines with reason)
  const declineEmergency = async (tokenId: string, reason: string) => {
    try {
      if (!user) {
        console.error('You must be logged in as a hospital to decline emergencies');
        return false;
      }
      if (!isHospitalUser) {
        console.error('Only hospital users can decline emergencies');
        return false;
      }

      // IMPORTANT: request the updated row back. If RLS blocks the update (0 rows),
      // supabase-js can otherwise return success with no error.
      const { data, error } = await supabase
        .from('emergency_tokens')
        .update({
          status: 'declined',
          decline_reason: reason,
          hospital_id: user.id,
        })
        .eq('id', tokenId)
        .select('*')
        .single();

      if (error || !data) throw error;

      const updated = normalizeToken(data);
      setTokens((prev) => {
        const next = prev.map((t) => (t.id === updated.id ? updated : t));
        setActiveToken(findActiveToken(next));
        return next;
      });

      return true;
    } catch (error) {
      console.error('Error declining emergency:', error);
      return false;
    }
  };

  // Get pending tokens (for hospital)
  const pendingTokens = tokens.filter(t => t.status === 'pending');
  const assignedTokens = tokens.filter(t => 
    (t.status === 'assigned' || t.status === 'route_selected') && 
    !['completed', 'cancelled', 'declined'].includes(t.status)
  );
  const activeTokens = tokens.filter(t => ['in_progress', 'at_patient', 'to_hospital'].includes(t.status));

  return {
    tokens,
    activeToken,
    pendingTokens,
    assignedTokens,
    activeTokens,
    loading,
    createToken,
    createHospitalEmergency,
    assignHospital,
    assignHospitalWithRoutes,
    setRoute,
    startJourney,
    arrivedAtPatient,
    startToHospital,
    completeEmergency,
    cancelEmergency,
    declineEmergency,
    releaseAmbulance,
    refreshTokens: fetchTokens,
    isAmbulanceDriver,
    isHospitalUser
  };
}
