import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Ambulance } from '@/types/database';

export function useAmbulanceRealtime() {
  const [ambulances, setAmbulances] = useState<Ambulance[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all active ambulances with driver details
  const fetchAmbulances = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('ambulances')
        .select(`
          *,
          driver:profiles!driver_id(
            id,
            full_name,
            email,
            role
          )
        `)
        .order('last_updated', { ascending: false });

      if (error) throw error;
      
      // Transform data to include driver details and consistent health data
      const ambulancesWithDrivers = (data || []).map(ambulance => ({
        ...ambulance,
        driver_name: ambulance.driver?.full_name || ambulance.driver?.email || null,
        driver_email: ambulance.driver?.email || null,
        care_type: 'Advanced Life Support', // Default care type
        battery_level: ambulance.vehicle_health?.battery_percent || 85,
        battery_percentage: ambulance.vehicle_health?.battery_percent || 85,
        fuel_level: ambulance.vehicle_health?.fuel_percent || 75
      }));
      
      setAmbulances(ambulancesWithDrivers as Ambulance[]);
    } catch (error) {
      console.error('Error fetching ambulances:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAmbulances();

    // Subscribe to realtime updates
    const ambulanceChannel = supabase
      .channel('ambulances-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ambulances',
        },
        (payload) => {
          console.log('[useAmbulanceRealtime] ambulance change:', payload.eventType);

          if (payload.eventType === 'INSERT') {
            // For new ambulances, fetch with driver details
            fetchAmbulances();
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Partial<Ambulance> & { id: string };
            setAmbulances((prev) =>
              prev.map((a) => (a.id === updated.id ? ({ ...a, ...updated } as Ambulance) : a))
            );
          } else if (payload.eventType === 'DELETE') {
            setAmbulances((prev) => prev.filter((a) => a.id !== payload.old.id));
          }
        }
      );

    // Subscribe to profile changes (driver details)
    const profileChannel = supabase
      .channel('profiles-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: 'role=eq.ambulance'
        },
        () => {
          console.log('[useAmbulanceRealtime] driver profile updated');
          fetchAmbulances(); // Refresh to get updated driver details
        }
      );

    ambulanceChannel.subscribe((status) => {
      console.log('[useAmbulanceRealtime] ambulance channel status:', status);
    });

    profileChannel.subscribe((status) => {
      console.log('[useAmbulanceRealtime] profile channel status:', status);
    });

    // Fallback polling to ensure the hospital UI updates even if realtime is delayed
    const pollId = window.setInterval(() => {
      fetchAmbulances();
    }, 5000);

    return () => {
      window.clearInterval(pollId);
      supabase.removeChannel(ambulanceChannel);
      supabase.removeChannel(profileChannel);
    };
  }, [fetchAmbulances]);

  // Get only ambulances with active emergency
  const activeEmergencies = ambulances.filter(a => a.emergency_status === 'active');

  return {
    ambulances,
    activeEmergencies,
    loading,
    refreshAmbulances: fetchAmbulances,
  };
}
