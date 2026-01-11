-- Admin Command Center Database Schema
-- Comprehensive city-level control system

-- System Control Table
CREATE TABLE IF NOT EXISTS public.system_control (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  system_enabled BOOLEAN DEFAULT true,
  emergency_broadcast TEXT,
  broadcast_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_by UUID REFERENCES auth.users(id)
);

-- Traffic Zone Control
CREATE TABLE IF NOT EXISTS public.traffic_zones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  zone_name TEXT NOT NULL,
  zone_bounds JSONB NOT NULL, -- GeoJSON polygon
  is_locked BOOLEAN DEFAULT false,
  locked_by UUID REFERENCES auth.users(id),
  locked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Green Corridor Management
CREATE TABLE IF NOT EXISTS public.green_corridors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  corridor_name TEXT NOT NULL,
  start_lat DECIMAL(10,8) NOT NULL,
  start_lng DECIMAL(11,8) NOT NULL,
  end_lat DECIMAL(10,8) NOT NULL,
  end_lng DECIMAL(11,8) NOT NULL,
  route_coordinates JSONB, -- Array of [lat, lng] points
  duration_minutes INTEGER DEFAULT 15,
  is_active BOOLEAN DEFAULT false,
  activated_by UUID REFERENCES auth.users(id),
  activated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Hospital Capacity Management
CREATE TABLE IF NOT EXISTS public.hospital_capacity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID REFERENCES public.hospitals(id) ON DELETE CASCADE,
  total_beds INTEGER DEFAULT 0,
  occupied_beds INTEGER DEFAULT 0,
  icu_beds INTEGER DEFAULT 0,
  occupied_icu_beds INTEGER DEFAULT 0,
  emergency_beds INTEGER DEFAULT 0,
  occupied_emergency_beds INTEGER DEFAULT 0,
  is_accepting_patients BOOLEAN DEFAULT true,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_by UUID REFERENCES auth.users(id)
);

-- System Analytics
CREATE TABLE IF NOT EXISTS public.system_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  total_emergencies INTEGER DEFAULT 0,
  avg_response_time_seconds INTEGER DEFAULT 0,
  lives_saved_estimate INTEGER DEFAULT 0,
  corridor_efficiency_percent DECIMAL(5,2) DEFAULT 0,
  hospital_overload_rate DECIMAL(5,2) DEFAULT 0,
  peak_emergency_zones JSONB, -- Array of zone coordinates
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add super_admin role
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';

-- Update profiles table for enhanced roles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'Delhi',
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false;

-- Update ambulances table for enhanced tracking
ALTER TABLE public.ambulances 
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS blocked_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS force_emergency_mode BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS trip_history JSONB DEFAULT '[]';

-- Update traffic_signals for enhanced control
ALTER TABLE public.traffic_signals 
ADD COLUMN IF NOT EXISTS manual_override BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS override_status TEXT DEFAULT 'normal',
ADD COLUMN IF NOT EXISTS override_duration_minutes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS health_status TEXT DEFAULT 'operational',
ADD COLUMN IF NOT EXISTS last_health_check TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

-- Insert default system control record
INSERT INTO public.system_control (system_enabled) VALUES (true) ON CONFLICT DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_system_analytics_date ON public.system_analytics(date);
CREATE INDEX IF NOT EXISTS idx_hospital_capacity_hospital_id ON public.hospital_capacity(hospital_id);

-- RLS Policies for Admin Command Center

-- System Control - Admin only
ALTER TABLE public.system_control ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage system control" ON public.system_control
  FOR ALL USING (has_role(auth.uid(), 'admin'::user_role) OR has_role(auth.uid(), 'super_admin'::user_role));

-- Traffic Zones - Admin only
ALTER TABLE public.traffic_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage traffic zones" ON public.traffic_zones
  FOR ALL USING (has_role(auth.uid(), 'admin'::user_role) OR has_role(auth.uid(), 'super_admin'::user_role));

-- Green Corridors - Admin only
ALTER TABLE public.green_corridors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage green corridors" ON public.green_corridors
  FOR ALL USING (has_role(auth.uid(), 'admin'::user_role) OR has_role(auth.uid(), 'super_admin'::user_role));

-- Hospital Capacity - Hospital and Admin
ALTER TABLE public.hospital_capacity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Hospital can update own capacity" ON public.hospital_capacity
  FOR ALL USING (
    has_role(auth.uid(), 'hospital'::user_role) OR 
    has_role(auth.uid(), 'admin'::user_role) OR 
    has_role(auth.uid(), 'super_admin'::user_role)
  );

-- System Analytics - Admin read only
ALTER TABLE public.system_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can view analytics" ON public.system_analytics
  FOR SELECT USING (has_role(auth.uid(), 'admin'::user_role) OR has_role(auth.uid(), 'super_admin'::user_role));

-- Audit Logs - Admin read only
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can view audit logs" ON public.audit_logs
  FOR SELECT USING (has_role(auth.uid(), 'admin'::user_role) OR has_role(auth.uid(), 'super_admin'::user_role));

-- Functions for audit logging
CREATE OR REPLACE FUNCTION log_audit_action(
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id TEXT DEFAULT NULL,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.audit_logs (
    user_id, action, resource_type, resource_id, old_values, new_values
  ) VALUES (
    auth.uid(), p_action, p_resource_type, p_resource_id, p_old_values, p_new_values
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for ambulance changes
CREATE OR REPLACE FUNCTION audit_ambulance_changes() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    PERFORM log_audit_action('UPDATE', 'ambulance', NEW.id::TEXT, to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM log_audit_action('INSERT', 'ambulance', NEW.id::TEXT, NULL, to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit_action('DELETE', 'ambulance', OLD.id::TEXT, to_jsonb(OLD), NULL);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_ambulance_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.ambulances
  FOR EACH ROW EXECUTE FUNCTION audit_ambulance_changes();

-- Update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_system_control_updated_at
  BEFORE UPDATE ON public.system_control
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();