import express from 'express';
import cookieParser from 'cookie-parser';
import { config, configProblems } from './config.js';
import authRoutes from './routes/auth.js';
import instagramRoutes from './routes/instagram.js';

const app = express();
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use('/api/auth', authRoutes);
app.use('/api/instagram', instagramRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(config.port, () => {
  console.log(`Server on ${config.backendUrl} (login type: ${config.loginType}, Graph ${config.version})`);
  const p = configProblems();
  if (p.length) console.warn('Configuration problems:\n - ' + p.join('\n - '));
});
