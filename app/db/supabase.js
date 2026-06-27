const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

// Grab the variables from your environment
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'YOUR_PROJECT_URL'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY'
const supabaseSecretKey = process.env.NEXT_PUBLIC_SUPABASE_SECRET_KEY || 'YOUR_SECRET_KEY'

// Create a single supabase client for interacting with your database
const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey);

module.exports = { supabase, supabaseAdmin };