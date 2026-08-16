import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lytfcvrjruhalevlhjuc.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_6UB9vh-ymUGDyoszhBQXVA_eDDlY-Vf';

export const supabase = createClient(supabaseUrl, supabaseKey);
