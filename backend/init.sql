-- Core Tables with PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create an ENUM type for User roles if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM('citizen', 'rescuer', 'ngo_admin');
    END IF;
END$$;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role user_role NOT NULL,
  phone VARCHAR(20) UNIQUE,
  name VARCHAR(100),
  current_location GEOGRAPHY(POINT),
  is_available BOOLEAN DEFAULT false,
  last_active TIMESTAMP,
  trust_score FLOAT DEFAULT 1.0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Enum for request severity and status
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'request_severity') THEN
        CREATE TYPE request_severity AS ENUM('critical', 'moderate', 'stable');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'request_status') THEN
        CREATE TYPE request_status AS ENUM('pending', 'accepted', 'en_route', 'rescued', 'fake_report');
    END IF;
END$$;

-- Rescue requests
CREATE TABLE IF NOT EXISTS rescue_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  citizen_id UUID REFERENCES users(id),
  animal_location GEOGRAPHY(POINT) NOT NULL,
  description TEXT,
  photos TEXT[],
  severity request_severity,
  status request_status DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  accepted_by UUID REFERENCES users(id),
  accepted_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- Live tracking
CREATE TABLE IF NOT EXISTS live_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES rescue_requests(id),
  rescuer_id UUID REFERENCES users(id),
  location GEOGRAPHY(POINT),
  timestamp TIMESTAMP DEFAULT NOW(),
  estimated_arrival integer
);

-- Enum for health passport status
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'health_status') THEN
        CREATE TYPE health_status AS ENUM('in_treatment', 'recovered', 'transferred');
    END IF;
END$$;

-- Animal health passport
CREATE TABLE IF NOT EXISTS health_passports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_type VARCHAR(50),
  rescue_request_id UUID REFERENCES rescue_requests(id),
  treatment_history JSONB,
  vet_notes TEXT,
  rehab_center VARCHAR(200),
  status health_status,
  created_at TIMESTAMP DEFAULT NOW()
);
