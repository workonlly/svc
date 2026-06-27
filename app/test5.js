require('dotenv').config({path: '../.env'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://zkcrcqerqtaznifhqdeg.supabase.co', 'sb_publishable_eBAWxKOoUkeP74KzMsuDhQ__xpEtjQP');
supabase.from('individuals').select('id, relativelinks').eq('id', 'I99').single().then(r => console.log("I99 links:", r.data)).catch(e => console.error(e));
