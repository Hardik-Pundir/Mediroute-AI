import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AdminSystemControl {
  id: string;
  system_enabled: boolean;
  emergency_broadcast: string | null;
  broadcast_active: boolean;
  updated_at: string;
}

export interface AdminAmbulance {
  id: string;
  vehicle_number: string;
  driver_id: string | null;
  current_lat: number;
  current_lng: number;
  speed: number;
  heading: number;
  emergency_status: string;
  is_blocked: boolean;
  blocked_by: string | null;
  blocked_at: string | null;
  force_emergency_mode: boolean;
  trip_history: any[];
  profiles?: {
    full_name: string | null;
    email: string;
  };
}

export interface TrafficSignalAdmin {
  id: string;
  signal_name: string;
  location_lat: number;
  location_lng: number;
  current_status: string;
  manual_override: boolean;
  override_status: string;
  override_duration_minutes: number;
  health_status: string;
  last_health_check: string;
}

export interface HospitalCapacityAdmin {
  id: string;
  hospital_id: string;
  hospital_name?: string;
  total_beds: number;
  occupied_beds: number;
  icu_beds: number;
  occupied_icu_beds: number;
  emergency_beds: number;
  occupied_emergency_beds: number;
  is_accepting_patients: boolean;
  last_updated: string;
}

export interface SystemAnalytics {
  total_emergencies: number;
  avg_response_time_seconds: number;
  lives_saved_estimate: number;
  corridor_efficiency_percent: number;
  hospital_overload_rate: number;
  peak_emergency_zones: any[];
  active_corridors: number;
  signals_overridden: number;
}

export function useAdminSystem() {
  const [systemControl, setSystemControl] = useState<AdminSystemControl | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSystemControl = async () => {
    try {
      const { data, error } = await supabase
        .from('system_control')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      setSystemControl(data);
    } catch (error) {
      console.error('Error loading system control:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSystemStatus = async () => {
    if (!systemControl) return false;

    try {
      const newStatus = !systemControl.system_enabled;
      const { error } = await supabase
        .from('system_control')
        .update({ system_enabled: newStatus })
        .eq('id', systemControl.id);

      if (error) throw error;

      setSystemControl({ ...systemControl, system_enabled: newStatus });
      
      // Log audit action
      await supabase.rpc('log_audit_action', {
        p_action: 'SYSTEM_TOGGLE',
        p_resource_type: 'system_control',
        p_resource_id: systemControl.id,
        p_new_values: { system_enabled: newStatus }
      });

      toast.success(`System ${newStatus ? 'ENABLED' : 'DISABLED'}`);
      return true;
    } catch (error) {
      console.error('Error toggling system status:', error);
      toast.error('Failed to update system status');
      return false;
    }
  };

  const sendEmergencyBroadcast = async (message: string) => {
    if (!systemControl) return false;

    try {
      const { error } = await supabase
        .from('system_control')
        .update({
          emergency_broadcast: message,
          broadcast_active: true
        })
        .eq('id', systemControl.id);

      if (error) throw error;

      // Log audit action
      await supabase.rpc('log_audit_action', {
        p_action: 'EMERGENCY_BROADCAST',
        p_resource_type: 'system_control',
        p_resource_id: systemControl.id,
        p_new_values: { emergency_broadcast: message, broadcast_active: true }
      });

      toast.success('Emergency broadcast sent to all units');
      await loadSystemControl();
      return true;
    } catch (error) {
      console.error('Error sending broadcast:', error);
      toast.error('Failed to send emergency broadcast');
      return false;
    }
  };

  const clearBroadcast = async () => {
    if (!systemControl) return false;

    try {
      const { error } = await supabase
        .from('system_control')
        .update({
          emergency_broadcast: null,
          broadcast_active: false
        })
        .eq('id', systemControl.id);

      if (error) throw error;

      toast.success('Emergency broadcast cleared');
      await loadSystemControl();
      return true;
    } catch (error) {
      console.error('Error clearing broadcast:', error);
      toast.error('Failed to clear broadcast');
      return false;
    }
  };

  useEffect(() => {
    loadSystemControl();
  }, []);

  return {
    systemControl,
    loading,
    toggleSystemStatus,
    sendEmergencyBroadcast,
    clearBroadcast,
    refreshSystemControl: loadSystemControl
  };
}

export function useAdminFleet() {
  const [ambulances, setAmbulances] = useState<AdminAmbulance[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAmbulances = async () => {
    try {
      const { data, error } = await supabase
        .from('ambulances')
        .select(`
          *,
          profiles!ambulances_driver_id_fkey(full_name, email)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setAmbulances(data || []);
    } catch (error) {
      console.error('Error loading ambulances:', error);
    } finally {
      setLoading(false);
    }
  };

  const blockAmbulance = async (ambulanceId: string, reason?: string) => {
    try {
      const { error } = await supabase
        .from('ambulances')
        .update({
          is_blocked: true,
          blocked_at: new Date().toISOString()
        })
        .eq('id', ambulanceId);

      if (error) throw error;

      // Log audit action
      await supabase.rpc('log_audit_action', {
        p_action: 'AMBULANCE_BLOCKED',
        p_resource_type: 'ambulance',
        p_resource_id: ambulanceId,
        p_new_values: { is_blocked: true, reason }
      });

      toast.success('Ambulance blocked successfully');
      await loadAmbulances();
      return true;
    } catch (error) {
      console.error('Error blocking ambulance:', error);
      toast.error('Failed to block ambulance');
      return false;
    }
  };

  const unblockAmbulance = async (ambulanceId: string) => {
    try {
      const { error } = await supabase
        .from('ambulances')
        .update({
          is_blocked: false,
          blocked_by: null,
          blocked_at: null
        })
        .eq('id', ambulanceId);

      if (error) throw error;

      // Log audit action
      await supabase.rpc('log_audit_action', {
        p_action: 'AMBULANCE_UNBLOCKED',
        p_resource_type: 'ambulance',
        p_resource_id: ambulanceId,
        p_new_values: { is_blocked: false }
      });

      toast.success('Ambulance unblocked successfully');
      await loadAmbulances();
      return true;
    } catch (error) {
      console.error('Error unblocking ambulance:', error);
      toast.error('Failed to unblock ambulance');
      return false;
    }
  };

  const forceEmergencyMode = async (ambulanceId: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('ambulances')
        .update({
          force_emergency_mode: enabled,
          emergency_status: enabled ? 'active' : 'inactive'
        })
        .eq('id', ambulanceId);

      if (error) throw error;

      // Log audit action
      await supabase.rpc('log_audit_action', {
        p_action: enabled ? 'FORCE_EMERGENCY_ON' : 'FORCE_EMERGENCY_OFF',
        p_resource_type: 'ambulance',
        p_resource_id: ambulanceId,
        p_new_values: { force_emergency_mode: enabled }
      });

      toast.success(`Emergency mode ${enabled ? 'activated' : 'deactivated'}`);
      await loadAmbulances();
      return true;
    } catch (error) {
      console.error('Error updating emergency mode:', error);
      toast.error('Failed to update emergency mode');
      return false;
    }
  };

  const reassignAmbulance = async (ambulanceId: string, newDriverId: string | null) => {
    try {
      const { error } = await supabase
        .from('ambulances')
        .update({ driver_id: newDriverId })
        .eq('id', ambulanceId);

      if (error) throw error;

      // Update driver profile
      if (newDriverId) {
        await supabase
          .from('profiles')
          .update({ ambulance_id: ambulanceId })
          .eq('id', newDriverId);
      }

      // Log audit action
      await supabase.rpc('log_audit_action', {
        p_action: 'AMBULANCE_REASSIGNED',
        p_resource_type: 'ambulance',
        p_resource_id: ambulanceId,
        p_new_values: { driver_id: newDriverId }
      });

      toast.success('Ambulance reassigned successfully');
      await loadAmbulances();
      return true;
    } catch (error) {
      console.error('Error reassigning ambulance:', error);
      toast.error('Failed to reassign ambulance');
      return false;
    }
  };

  useEffect(() => {
    loadAmbulances();

    // Set up real-time subscription
    const subscription = supabase
      .channel('admin_ambulances')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'ambulances' },
        () => loadAmbulances()
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return {
    ambulances,
    loading,
    blockAmbulance,
    unblockAmbulance,
    forceEmergencyMode,
    reassignAmbulance,
    refreshAmbulances: loadAmbulances
  };
}

export function useAdminTraffic() {
  const [signals, setSignals] = useState<TrafficSignalAdmin[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSignals = async () => {
    try {
      const { data, error } = await supabase
        .from('traffic_signals')
        .select('*')
        .order('signal_name');

      if (error) throw error;

      setSignals(data || []);
    } catch (error) {
      console.error('Error loading traffic signals:', error);
    } finally {
      setLoading(false);
    }
  };

  const overrideSignal = async (signalId: string, status: 'green' | 'red' | 'normal', durationMinutes: number = 15) => {
    try {
      const { error } = await supabase
        .from('traffic_signals')
        .update({
          manual_override: status !== 'normal',
          override_status: status,
          override_duration_minutes: status !== 'normal' ? durationMinutes : 0,
          current_status: status === 'normal' ? 'normal' : status
        })
        .eq('id', signalId);

      if (error) throw error;

      // Log audit action
      await supabase.rpc('log_audit_action', {
        p_action: 'SIGNAL_OVERRIDE',
        p_resource_type: 'traffic_signal',
        p_resource_id: signalId,
        p_new_values: { override_status: status, duration_minutes: durationMinutes }
      });

      toast.success(`Signal set to ${status.toUpperCase()}`);
      await loadSignals();
      return true;
    } catch (error) {
      console.error('Error overriding signal:', error);
      toast.error('Failed to override signal');
      return false;
    }
  };

  const createGreenCorridor = async (
    name: string,
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number,
    durationMinutes: number = 15
  ) => {
    try {
      const { error } = await supabase
        .from('green_corridors')
        .insert({
          corridor_name: name,
          start_lat: startLat,
          start_lng: startLng,
          end_lat: endLat,
          end_lng: endLng,
          duration_minutes: durationMinutes,
          is_active: true,
          activated_at: new Date().toISOString()
        });

      if (error) throw error;

      // Log audit action
      await supabase.rpc('log_audit_action', {
        p_action: 'GREEN_CORRIDOR_CREATED',
        p_resource_type: 'green_corridor',
        p_new_values: { corridor_name: name, duration_minutes: durationMinutes }
      });

      toast.success('Green corridor activated');
      return true;
    } catch (error) {
      console.error('Error creating green corridor:', error);
      toast.error('Failed to create green corridor');
      return false;
    }
  };

  const lockTrafficZone = async (zoneName: string, bounds: any) => {
    try {
      const { error } = await supabase
        .from('traffic_zones')
        .insert({
          zone_name: zoneName,
          zone_bounds: bounds,
          is_locked: true,
          locked_at: new Date().toISOString()
        });

      if (error) throw error;

      // Log audit action
      await supabase.rpc('log_audit_action', {
        p_action: 'TRAFFIC_ZONE_LOCKED',
        p_resource_type: 'traffic_zone',
        p_new_values: { zone_name: zoneName }
      });

      toast.success('Traffic zone locked');
      return true;
    } catch (error) {
      console.error('Error locking traffic zone:', error);
      toast.error('Failed to lock traffic zone');
      return false;
    }
  };

  useEffect(() => {
    loadSignals();

    // Set up real-time subscription
    const subscription = supabase
      .channel('admin_traffic_signals')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'traffic_signals' },
        () => loadSignals()
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return {
    signals,
    loading,
    overrideSignal,
    createGreenCorridor,
    lockTrafficZone,
    refreshSignals: loadSignals
  };
}

export function useAdminHospitals() {
  const [hospitalCapacities, setHospitalCapacities] = useState<HospitalCapacityAdmin[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHospitalCapacities = async () => {
    try {
      const { data, error } = await supabase
        .from('hospital_capacity')
        .select(`
          *,
          hospitals!hospital_capacity_hospital_id_fkey(name, location_lat, location_lng)
        `)
        .order('last_updated', { ascending: false });

      if (error) throw error;

      const capacitiesWithNames = (data || []).map(cap => ({
        ...cap,
        hospital_name: cap.hospitals?.name || 'Unknown Hospital'
      }));

      setHospitalCapacities(capacitiesWithNames);
    } catch (error) {
      console.error('Error loading hospital capacities:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateHospitalCapacity = async (
    hospitalId: string,
    capacityData: Partial<HospitalCapacityAdmin>
  ) => {
    try {
      const { error } = await supabase
        .from('hospital_capacity')
        .upsert({
          hospital_id: hospitalId,
          ...capacityData,
          last_updated: new Date().toISOString()
        });

      if (error) throw error;

      // Log audit action
      await supabase.rpc('log_audit_action', {
        p_action: 'HOSPITAL_CAPACITY_UPDATED',
        p_resource_type: 'hospital_capacity',
        p_resource_id: hospitalId,
        p_new_values: capacityData
      });

      toast.success('Hospital capacity updated');
      await loadHospitalCapacities();
      return true;
    } catch (error) {
      console.error('Error updating hospital capacity:', error);
      toast.error('Failed to update hospital capacity');
      return false;
    }
  };

  const toggleHospitalAcceptance = async (hospitalId: string, accepting: boolean) => {
    try {
      const { error } = await supabase
        .from('hospital_capacity')
        .update({
          is_accepting_patients: accepting,
          last_updated: new Date().toISOString()
        })
        .eq('hospital_id', hospitalId);

      if (error) throw error;

      // Log audit action
      await supabase.rpc('log_audit_action', {
        p_action: accepting ? 'HOSPITAL_REOPENED' : 'HOSPITAL_CLOSED',
        p_resource_type: 'hospital_capacity',
        p_resource_id: hospitalId,
        p_new_values: { is_accepting_patients: accepting }
      });

      toast.success(`Hospital ${accepting ? 'reopened' : 'closed'} for new patients`);
      await loadHospitalCapacities();
      return true;
    } catch (error) {
      console.error('Error toggling hospital acceptance:', error);
      toast.error('Failed to update hospital status');
      return false;
    }
  };

  useEffect(() => {
    loadHospitalCapacities();

    // Set up real-time subscription
    const subscription = supabase
      .channel('admin_hospital_capacity')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'hospital_capacity' },
        () => loadHospitalCapacities()
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return {
    hospitalCapacities,
    loading,
    updateHospitalCapacity,
    toggleHospitalAcceptance,
    refreshHospitalCapacities: loadHospitalCapacities
  };
}

export function useAdminAnalytics() {
  const [analytics, setAnalytics] = useState<SystemAnalytics>({
    total_emergencies: 0,
    avg_response_time_seconds: 0,
    lives_saved_estimate: 0,
    corridor_efficiency_percent: 0,
    hospital_overload_rate: 0,
    peak_emergency_zones: [],
    active_corridors: 0,
    signals_overridden: 0
  });
  const [loading, setLoading] = useState(true);

  const loadAnalytics = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Get today's emergencies
      const { data: emergencies } = await supabase
        .from('emergency_tokens')
        .select('*')
        .gte('created_at', today);

      // Get completed emergencies for response time calculation
      const { data: completedEmergencies } = await supabase
        .from('emergency_tokens')
        .select('*')
        .not('completed_at', 'is', null)
        .gte('created_at', today);

      // Get active corridors
      const { data: corridors } = await supabase
        .from('green_corridors')
        .select('*')
        .eq('is_active', true);

      // Get overridden signals
      const { data: overriddenSignals } = await supabase
        .from('traffic_signals')
        .select('*')
        .eq('manual_override', true);

      // Get hospital capacities for overload calculation
      const { data: hospitalCapacities } = await supabase
        .from('hospital_capacity')
        .select('*');

      // Calculate analytics
      const totalEmergencies = emergencies?.length || 0;
      
      let avgResponseTime = 0;
      if (completedEmergencies && completedEmergencies.length > 0) {
        const totalResponseTime = completedEmergencies.reduce((sum, token) => {
          const created = new Date(token.created_at).getTime();
          const completed = new Date(token.completed_at).getTime();
          return sum + (completed - created);
        }, 0);
        avgResponseTime = Math.floor(totalResponseTime / completedEmergencies.length / 1000);
      }

      const livesSaved = Math.floor(totalEmergencies * 0.85);
      const corridorEfficiency = Math.min(95, 60 + (totalEmergencies * 2));
      
      let hospitalOverload = 0;
      if (hospitalCapacities && hospitalCapacities.length > 0) {
        hospitalOverload = hospitalCapacities.reduce((sum, h) => 
          sum + (h.occupied_beds / Math.max(h.total_beds, 1)), 0) / hospitalCapacities.length * 100;
      }

      setAnalytics({
        total_emergencies: totalEmergencies,
        avg_response_time_seconds: avgResponseTime,
        lives_saved_estimate: livesSaved,
        corridor_efficiency_percent: corridorEfficiency,
        hospital_overload_rate: hospitalOverload,
        peak_emergency_zones: [],
        active_corridors: corridors?.length || 0,
        signals_overridden: overriddenSignals?.length || 0
      });

    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();

    // Refresh analytics every 30 seconds
    const interval = setInterval(loadAnalytics, 30000);

    return () => clearInterval(interval);
  }, []);

  return {
    analytics,
    loading,
    refreshAnalytics: loadAnalytics
  };
}