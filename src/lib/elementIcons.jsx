/**
 * Explicit map of the curated element icons. Named imports (not `import *`) so
 * Vite tree-shakes lucide down to just these — keeps the bundle small.
 * Keys MUST match the ICONS list in ./elements.js.
 */
import {
  Star, Heart, Check, CheckCircle, Zap, Bell, Award, Trophy, Shield, Lock,
  Sparkles, Flame, ThumbsUp, Rocket, TrendingUp, Gift, Crown, Target, Smartphone,
  Camera, Music, ShoppingCart, CreditCard, Plane, Car, Dumbbell, Users,
  MessageCircle, Play, Download, Search, Settings, Bookmark, Tag, Gem,
} from "lucide-react";

export const ELEMENT_ICONS = {
  Star, Heart, Check, CheckCircle, Zap, Bell, Award, Trophy, Shield, Lock,
  Sparkles, Flame, ThumbsUp, Rocket, TrendingUp, Gift, Crown, Target, Smartphone,
  Camera, Music, ShoppingCart, CreditCard, Plane, Car, Dumbbell, Users,
  MessageCircle, Play, Download, Search, Settings, Bookmark, Tag, Gem,
};

export function elementIcon(name) {
  return ELEMENT_ICONS[name] || Star;
}
