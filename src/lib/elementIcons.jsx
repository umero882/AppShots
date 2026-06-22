/**
 * Explicit map of the curated element icons. Named imports (not `import *`) so
 * Vite tree-shakes lucide to just these. Keys MUST match the ICONS list in
 * ./elements.js (elementIcon() falls back to Star for any missing name).
 */
import {
  Star, Heart, Check, CheckCircle, CheckCircle2, Zap, Bell, BellRing,
  Award, Trophy, Shield, ShieldCheck, Lock, Unlock, Key, Sparkles,
  Flame, ThumbsUp, ThumbsDown, Rocket, TrendingUp, TrendingDown, Gift,
  Crown, Target, Smartphone, Tablet, Laptop, Monitor, Camera, Music,
  Music2, Headphones, Mic, Video, Image, Film, Tv, Radio, Speaker,
  Volume2, ShoppingCart, ShoppingBag, CreditCard, Wallet, DollarSign,
  Percent, Plane, Car, Bike, Truck, Bus, Dumbbell, Activity, Users,
  User, UserPlus, MessageCircle, MessageSquare, Mail, Phone, Send,
  Share2, Link, Play, Pause, Download, Upload, Search, Settings,
  Sliders, Filter, Bookmark, Tag, Tags, Gem, Home, Building2, Store,
  Briefcase, Package, Box, Calendar, Clock, MapPin, Map, Globe, Compass,
  Navigation, Flag, Wifi, Battery, Cloud, Sun, Moon, Umbrella, Snowflake,
  Coffee, Pizza, Eye, EyeOff, Lightbulb, Megaphone, Palette,
  Brush, Droplet, Feather, Leaf, Flower2, Trees, Mountain, Waves, Anchor,
  Code, Terminal, Cpu, Database, Server, Github, Smile, Laugh, Hand,
  Plus, Minus, X, ArrowRight, ArrowUp, RefreshCw, Power, Layers, Grid3x3,
  BarChart3, PieChart, LineChart,
} from "lucide-react";

export const ELEMENT_ICONS = {
  Star, Heart, Check, CheckCircle, CheckCircle2, Zap, Bell, BellRing,
  Award, Trophy, Shield, ShieldCheck, Lock, Unlock, Key, Sparkles,
  Flame, ThumbsUp, ThumbsDown, Rocket, TrendingUp, TrendingDown, Gift,
  Crown, Target, Smartphone, Tablet, Laptop, Monitor, Camera, Music,
  Music2, Headphones, Mic, Video, Image, Film, Tv, Radio, Speaker,
  Volume2, ShoppingCart, ShoppingBag, CreditCard, Wallet, DollarSign,
  Percent, Plane, Car, Bike, Truck, Bus, Dumbbell, Activity, Users,
  User, UserPlus, MessageCircle, MessageSquare, Mail, Phone, Send,
  Share2, Link, Play, Pause, Download, Upload, Search, Settings,
  Sliders, Filter, Bookmark, Tag, Tags, Gem, Home, Building2, Store,
  Briefcase, Package, Box, Calendar, Clock, MapPin, Map, Globe, Compass,
  Navigation, Flag, Wifi, Battery, Cloud, Sun, Moon, Umbrella, Snowflake,
  Coffee, Pizza, Eye, EyeOff, Lightbulb, Megaphone, Palette,
  Brush, Droplet, Feather, Leaf, Flower2, Trees, Mountain, Waves, Anchor,
  Code, Terminal, Cpu, Database, Server, Github, Smile, Laugh, Hand,
  Plus, Minus, X, ArrowRight, ArrowUp, RefreshCw, Power, Layers, Grid3x3,
  BarChart3, PieChart, LineChart,
};

export function elementIcon(name) {
  return ELEMENT_ICONS[name] || Star;
}
