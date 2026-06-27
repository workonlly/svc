CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TABLE IF NOT EXISTS person (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    mobile VARCHAR(15) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_person_modtime
BEFORE UPDATE ON person
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TABLE IF NOT EXISTS links (
    id SERIAL PRIMARY KEY,
    owner_id INT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
    link_hash VARCHAR(255) UNIQUE NOT NULL,
    access_level VARCHAR(10) DEFAULT 'view', 
    data_pointer JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT check_access_level CHECK (access_level IN ('view', 'edit')) 
);

CREATE TRIGGER update_links_modtime
BEFORE UPDATE ON links
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TABLE IF NOT EXISTS contactquery (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    checked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_contactquery_modtime
BEFORE UPDATE ON contactquery
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TABLE IF NOT EXISTS loggedin (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255),
    mobile VARCHAR(15),
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS individuals (
    id VARCHAR(255) PRIMARY KEY,       
    given_names VARCHAR(255),          
    surname VARCHAR(255),              
    birth_year_calculated INTEGER,     
    profile_media_id VARCHAR(33),      
    raw_metadata JSONB
);

CREATE TABLE IF NOT EXISTS families (
    id VARCHAR(255) PRIMARY KEY,       
    husband_id VARCHAR(255) REFERENCES individuals(id) ON DELETE SET NULL,
    wife_id VARCHAR(255) REFERENCES individuals(id) ON DELETE SET NULL,
    raw_metadata JSONB                 
);

CREATE TABLE IF NOT EXISTS family_children (
    id SERIAL PRIMARY KEY,
    family_id VARCHAR(255) REFERENCES families(id) ON DELETE CASCADE,
    child_id VARCHAR(255) REFERENCES individuals(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) DEFAULT 'biological' 
);

CREATE TABLE IF NOT EXISTS publications (
    id VARCHAR(255) PRIMARY KEY,     
    title VARCHAR(255),        
    publication_year INTEGER,          
    publisher VARCHAR(255),            
    description TEXT,        
    gdrive_file_id VARCHAR(33) UNIQUE NOT NULL 
);


CREATE TABLE IF NOT EXISTS individual_publications (
    id SERIAL PRIMARY KEY,
    individual_id VARCHAR(255) REFERENCES individuals(id) ON DELETE CASCADE,
    publication_id VARCHAR(255) REFERENCES publications(id) ON DELETE CASCADE,
    contribution_type VARCHAR(50) DEFAULT 'subject'     
);