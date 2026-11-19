// App icons: lucide-react at 16px / stroke 1.75 by default. Names are kept stable for callers.
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Briefcase,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  Inbox,
  Info,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Reply,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

type IconProps = LucideProps & { size?: number };

function wrap(Icon: LucideIcon) {
  function AppIcon({ size = 16, strokeWidth = 1.75, ...rest }: IconProps) {
    return <Icon size={size} strokeWidth={strokeWidth} aria-hidden="true" focusable="false" {...rest} />;
  }
  return AppIcon;
}

export const IconDashboard = wrap(LayoutDashboard);
export const IconUsers = wrap(Users);
export const IconTemplate = wrap(FileText);
export const IconUpload = wrap(Upload);
export const IconClock = wrap(Clock);
export const IconSend = wrap(Send);
export const IconSettings = wrap(Settings);
export const IconMail = wrap(Mail);
export const IconCheck = wrap(Check);
export const IconCheckCircle = wrap(CheckCircle2);
export const IconAlert = wrap(AlertTriangle);
export const IconInfo = wrap(Info);
export const IconX = wrap(X);
export const IconMenu = wrap(Menu);
export const IconRefresh = wrap(RefreshCw);
export const IconPlus = wrap(Plus);
export const IconSearch = wrap(Search);
export const IconReply = wrap(Reply);
export const IconArrowLeft = wrap(ArrowLeft);
export const IconArrowRight = wrap(ArrowRight);
export const IconExternal = wrap(ExternalLink);
export const IconTrash = wrap(Trash2);
export const IconPencil = wrap(Pencil);
export const IconEye = wrap(Eye);
export const IconEyeOff = wrap(EyeOff);
export const IconDownload = wrap(Download);
export const IconInbox = wrap(Inbox);
export const IconFile = wrap(FileText);
export const IconCopy = wrap(Copy);
export const IconCalendar = wrap(Calendar);
export const IconLogo = wrap(Mail);
export const IconLogOut = wrap(LogOut);
export const IconShield = wrap(ShieldCheck);
export const IconBuilding = wrap(Building2);
export const IconBriefcase = wrap(Briefcase);
export const IconPaperclip = wrap(Paperclip);
export const IconGraduation = wrap(GraduationCap);
