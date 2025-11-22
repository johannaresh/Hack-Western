require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

async function run() {
  const { data, error } = await supabase
    .from("reps")
    .insert({
      set_id: 2,         // <-- use the real sets.id you created
      rep_index: 99,
      t_ms_start: 0,
      t_ms_end: 0,
      peak_amag: 1.23,
      peak_gyro: 0.0,
      peak_strain_ue: 0.0,
      tempo_ms: 0,
    })
    .select();

  if (error) {
    console.error("ERROR:", error.message);
  } else {
    console.log("OK, inserted:", data);
  }
}

run();
