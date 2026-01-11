import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useEmergencyBroadcast = () => {
  const [emergencyBroadcast, setEmergencyBroadcast] = useState<string | null>(null);
  const [showBroadcast, setShowBroadcast] = useState(false);

  useEffect(() => {
    const subscription = supabase
      .channel('system_control')
      .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'system_control' },
        (payload) => {
          if (payload.new.broadcast_active && payload.new.emergency_broadcast) {
            setEmergencyBroadcast(payload.new.emergency_broadcast);
            setShowBroadcast(true);
            
            // Auto-hide after 1 minute
            setTimeout(() => {
              setShowBroadcast(false);
            }, 60000);
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return {
    emergencyBroadcast,
    showBroadcast,
    setShowBroadcast
  };
};