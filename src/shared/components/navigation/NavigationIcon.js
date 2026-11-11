import {
  Activity, AudioLines, Blocks, BookOpen, ChartNoAxesCombined, Code2,
  Coins, Database, Gauge, Globe2, ImageIcon, KeyRound, Languages,
  Layers3, MessageSquare, Mic, Network, Settings2, ShieldCheck,
  SlidersHorizontal, Terminal, VectorSquare, Video,
} from "lucide-react";

const icons = {
  key: KeyRound, providers: Database, layers: Layers3, chat: MessageSquare,
  code: Code2, media: ImageIcon, embedding: VectorSquare, image: ImageIcon,
  video: Video, audio: AudioLines, microphone: Mic, globe: Globe2,
  skills: Blocks, chart: ChartNoAxesCombined, quota: Gauge,
  savings: SlidersHorizontal, activity: Activity, network: Network,
  shield: ShieldCheck, terminal: Terminal, translate: Languages,
  settings: Settings2, pricing: Coins, book: BookOpen,
};

export default function NavigationIcon({ name, size = 18, ...props }) {
  const Icon = icons[name] || Blocks;
  return <Icon size={size} aria-hidden="true" {...props} />;
}
