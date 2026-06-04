import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://iawgnwcfqcekrrpiyhzm.supabase.co'
const supabaseAnonKey = 'sb_publishable_qUBZFR1kqEi6-nPX1z52Rg_HbfBmPwt'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)