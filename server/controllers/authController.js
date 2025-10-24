import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { loginSchema, registerSchema } from '../utils/validate.js';
import { signToken } from '../middleware/auth.js';

export async function register(req, res) {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { email, password } = parsed.data;
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: 'Email already in use' });
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hash });
    const token = signToken(user);
    res.status(201).json({ token, user: { id: user._id, email: user.email } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function login(req, res) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { email, password } = parsed.data;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = signToken(user);
    res.json({ token, user: { id: user._id, email: user.email } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
