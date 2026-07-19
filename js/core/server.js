// Make sure to link this in the index.html when you use it again!

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

window.supabase = createClient(
  "https://zhourvalrglpcuwpogkz.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpob3VydmFscmdscGN1d3BvZ2t6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NDkyNzgsImV4cCI6MjA4NTIyNTI3OH0.13wOIBlzWchxbfqm3yAD9C1LZ1sFyHuDrSgnf_0CTQg",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
