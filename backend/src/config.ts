import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  host: process.env.HOST || '0.0.0.0',
  dbPath: process.env.DB_PATH || './data/coolshift.db',
  uploadsDir: process.env.UPLOADS_DIR || './uploads',
  outputsDir: process.env.OUTPUTS_DIR || './outputs',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  environment: process.env.NODE_ENV || 'development',
  openMeteoBaseUrl: 'https://api.open-meteo.com/v1',
  defaultTimezone: 'Asia/Karachi',
  intervalMinutes: 15,
  defaultWeights: {
    cost: 0.4,
    emissions: 0.3,
    comfort: 0.25,
    peak: 0.05,
  },
  thermal: {
    // R_thermal (°C/kW) by insulation level
    resistance: { Low: 2.0, Medium: 4.0, High: 6.0 },
    // C_thermal (kWh/°C) base per 100m²
    capacitanceBase: { Low: 0.8, Medium: 1.2, High: 1.8 },
    // Heat gain per occupant (kW)
    occupantHeatGain: 0.1,
    // Solar heat gain coefficient
    solarHeatGainCoeff: { Low: 0.02, Medium: 0.04, High: 0.06 },
  },
};
