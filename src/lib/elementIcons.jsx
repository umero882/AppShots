/**
 * Explicit map of the element icons. Named imports (not `import *`) so Vite
 * tree-shakes lucide to just these. Keys MUST match the ICONS list in
 * ./elements.js (elementIcon() falls back to Star for any missing name).
 *
 * Curated (not the full ~1500 lucide set) to keep the bundle lean while still
 * covering the common ASO/screenshot needs; the Icons panel search filters this
 * set by name + keyword tags (see ICON_TAGS in ./elements.js).
 */
import {
  Star, Heart, Check, CheckCircle, CheckCircle2, BadgeCheck, Zap, Bell, BellRing, BellOff,
  Award, Trophy, Medal, Shield, ShieldCheck, ShieldAlert, Lock, Unlock, Key, KeyRound, Sparkles,
  Flame, ThumbsUp, ThumbsDown, Rocket, TrendingUp, TrendingDown, Gift, PartyPopper,
  Crown, Gem, Target, Smartphone, Tablet, Laptop, Monitor, MonitorSmartphone, Watch, Camera, Music,
  Music2, Headphones, Mic, Video, Webcam, Image, Film, Tv, Radio, Speaker,
  Volume2, ShoppingCart, ShoppingBag, CreditCard, Wallet, Banknote, Coins, PiggyBank, Receipt, DollarSign,
  Percent, BadgePercent, BadgeDollarSign, Calculator, Plane, Car, Bike, Truck, Bus, TrainFront, Ship, Sailboat, Fuel,
  Dumbbell, Activity, HeartPulse, Users, Footprints, PersonStanding, Baby,
  User, UserPlus, UserCheck, MessageCircle, MessageSquare, Mail, Inbox, AtSign, Hash, Phone, PhoneCall, Send, Reply,
  Share2, Link, Play, Pause, Download, Upload, UploadCloud, DownloadCloud, Search, Settings, Settings2, Wrench, Hammer, Cog,
  Sliders, Filter, Bookmark, Tag, Tags, Sticker, Pin, Paperclip, Home, Building2, Landmark, Hotel, School, Factory, Store,
  Briefcase, Package, Box, Calendar, CalendarDays, CalendarCheck, Clock, AlarmClock, Timer, Hourglass, MapPin, Map, Globe, Compass,
  Navigation, Flag, Wifi, WifiOff, Network, HardDrive, Battery, BatteryCharging, Rss, Podcast, Bluetooth, QrCode,
  Cloud, CloudRain, CloudSnow, CloudLightning, Wind, Rainbow, Sun, Sunrise, Sunset, Moon, Umbrella, Snowflake, Thermometer, Droplets,
  Coffee, Pizza, Apple, Cake, Wine, Beer, IceCream, Utensils, ChefHat, Carrot, Croissant, Egg, Fish, Sandwich, Cookie, Candy,
  Eye, EyeOff, Lightbulb, Megaphone, Palette, Brush, PenTool, Pencil, Highlighter, Ruler, Scissors, Type, List, ListOrdered, ListChecks, Quote,
  Droplet, Feather, Leaf, Sprout, Flower2, Trees, Mountain, Waves, Anchor, PawPrint, Dog, Cat, Bird, Bug,
  Code, Terminal, Cpu, Database, Server, Github, Bot, Brain, Atom, FlaskConical, Microscope, Magnet, Puzzle, Ghost, Keyboard, Mouse,
  ClipboardList, FileText, Folder, FolderOpen, Save, Printer, Fingerprint, ScanLine,
  Smile, Frown, Meh, Laugh, Hand, HeartHandshake,
  Plus, Minus, X, ArrowRight, ArrowUp, RefreshCw, Power, Layers, Grid3x3,
  BarChart3, PieChart, LineChart,
} from "lucide-react";

export const ELEMENT_ICONS = {
  Star, Heart, Check, CheckCircle, CheckCircle2, BadgeCheck, Zap, Bell, BellRing, BellOff,
  Award, Trophy, Medal, Shield, ShieldCheck, ShieldAlert, Lock, Unlock, Key, KeyRound, Sparkles,
  Flame, ThumbsUp, ThumbsDown, Rocket, TrendingUp, TrendingDown, Gift, PartyPopper,
  Crown, Gem, Target, Smartphone, Tablet, Laptop, Monitor, MonitorSmartphone, Watch, Camera, Music,
  Music2, Headphones, Mic, Video, Webcam, Image, Film, Tv, Radio, Speaker,
  Volume2, ShoppingCart, ShoppingBag, CreditCard, Wallet, Banknote, Coins, PiggyBank, Receipt, DollarSign,
  Percent, BadgePercent, BadgeDollarSign, Calculator, Plane, Car, Bike, Truck, Bus, TrainFront, Ship, Sailboat, Fuel,
  Dumbbell, Activity, HeartPulse, Users, Footprints, PersonStanding, Baby,
  User, UserPlus, UserCheck, MessageCircle, MessageSquare, Mail, Inbox, AtSign, Hash, Phone, PhoneCall, Send, Reply,
  Share2, Link, Play, Pause, Download, Upload, UploadCloud, DownloadCloud, Search, Settings, Settings2, Wrench, Hammer, Cog,
  Sliders, Filter, Bookmark, Tag, Tags, Sticker, Pin, Paperclip, Home, Building2, Landmark, Hotel, School, Factory, Store,
  Briefcase, Package, Box, Calendar, CalendarDays, CalendarCheck, Clock, AlarmClock, Timer, Hourglass, MapPin, Map, Globe, Compass,
  Navigation, Flag, Wifi, WifiOff, Network, HardDrive, Battery, BatteryCharging, Rss, Podcast, Bluetooth, QrCode,
  Cloud, CloudRain, CloudSnow, CloudLightning, Wind, Rainbow, Sun, Sunrise, Sunset, Moon, Umbrella, Snowflake, Thermometer, Droplets,
  Coffee, Pizza, Apple, Cake, Wine, Beer, IceCream, Utensils, ChefHat, Carrot, Croissant, Egg, Fish, Sandwich, Cookie, Candy,
  Eye, EyeOff, Lightbulb, Megaphone, Palette, Brush, PenTool, Pencil, Highlighter, Ruler, Scissors, Type, List, ListOrdered, ListChecks, Quote,
  Droplet, Feather, Leaf, Sprout, Flower2, Trees, Mountain, Waves, Anchor, PawPrint, Dog, Cat, Bird, Bug,
  Code, Terminal, Cpu, Database, Server, Github, Bot, Brain, Atom, FlaskConical, Microscope, Magnet, Puzzle, Ghost, Keyboard, Mouse,
  ClipboardList, FileText, Folder, FolderOpen, Save, Printer, Fingerprint, ScanLine,
  Smile, Frown, Meh, Laugh, Hand, HeartHandshake,
  Plus, Minus, X, ArrowRight, ArrowUp, RefreshCw, Power, Layers, Grid3x3,
  BarChart3, PieChart, LineChart,
};

export function elementIcon(name) {
  return ELEMENT_ICONS[name] || Star;
}
