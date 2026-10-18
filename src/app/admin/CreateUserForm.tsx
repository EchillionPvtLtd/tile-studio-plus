"use client";

import { addDaysISO, asBillingDay, asDurationMonths, BILLING_DAY_LABELS, DURATION_MONTHS, durationLabel, expiryAfterMonths, formatLongDate, packageChoices, type BillingDay, type PackageChoice } from "@/lib/subscriptionPlans";
import { DEFAULT_SUBSCRIPTION_PLANS, type SubscriptionPlanItem } from "@/lib/subscriptionPlanTypes";
import React, { useActionState, useState, useEffect } from "react";
import { createUser, CreateUserState } from "@/actions/admin";
import { 
  Store, 
  MapPin, 
  UserCheck, 
  CreditCard, 
  Sparkles, 
  RefreshCw, 
  Check, 
  AlertCircle, 
  Copy, 
  Eye, 
  EyeOff, 
  X, 
  Building2, 
  Phone, 
  Mail, 
  Globe, 
  FileText, 
  ShieldCheck,
  Calendar,
  Layers
} from "lucide-react";

const initialState: CreateUserState = {};

interface CreateUserFormProps {
  onCancel?: () => void;
  onSuccess?: () => void;
  /** The packages saved in the admin dashboard; a package made there is offered here straight away. */
  plans?: SubscriptionPlanItem[];
}

/** How a package is paid when the showroom is created: the Free Trial is waived, a fixed-price package is collected, the Custom Plan waits for the agreed amount. */
const paymentStatusFor = (c: PackageChoice) => (c.value === "Free Trial" ? "Waived" : c.fixedPrice ? "Paid" : "Pending");

const SRI_LANKA_PROVINCES = [
  "Western Province",
  "Central Province",
  "Southern Province",
  "North Western Province",
  "Northern Province",
  "Eastern Province",
  "North Central Province",
  "Uva Province",
  "Sabaragamuwa Province",
];

const SRI_LANKA_DISTRICTS = [
  "Colombo",
  "Gampaha",
  "Kalutara",
  "Kandy",
  "Matale",
  "Nuwara Eliya",
  "Galle",
  "Matara",
  "Hambantota",
  "Jaffna",
  "Kilinochchi",
  "Mannar",
  "Vavuniya",
  "Mullaitivu",
  "Batticaloa",
  "Ampara",
  "Trincomalee",
  "Kurunegala",
  "Puttalam",
  "Anuradhapura",
  "Polonnaruwa",
  "Badulla",
  "Monaragala",
  "Ratnapura",
  "Kegalle",
];

/** The expiry date: 14 days for a trial, otherwise the chosen number of months after the start (month-end safe). */
function calculateExpiry(startDateStr: string, isTrial: boolean, months: string): string {
  if (isTrial) return addDaysISO(startDateStr, 14);
  return expiryAfterMonths(startDateStr, Number(months));
}

export function CreateUserForm({ onCancel, onSuccess, plans }: CreateUserFormProps) {
  const choices = packageChoices(plans && plans.length > 0 ? plans : DEFAULT_SUBSCRIPTION_PLANS);
  const [state, formAction, isPending] = useActionState(createUser, initialState);

  // Today formatted as YYYY-MM-DD
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // ── Form State ────────────────────────────────────────────────────────
  // 1. Basic & Business Info
  const [shopName, setShopName] = useState("");
  const [companyRegName, setCompanyRegName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [businessRegNo, setBusinessRegNo] = useState("");
  const [taxVatNo, setTaxVatNo] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [description, setDescription] = useState("");

  // 2. Shop Address
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("Colombo");
  const [district, setDistrict] = useState("Colombo");
  const [province, setProvince] = useState("Western Province");
  const [postalCode, setPostalCode] = useState("");

  // 3. Shop Admin Account
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("Shop@2026!");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [accountStatus, setAccountStatus] = useState<"Active" | "Suspended">("Active");

  // 4. Subscription & Payment
  const firstChoice = choices.find((c) => c.value === "Starter") ?? choices.find((c) => c.value !== "Free Trial") ?? choices[0];
  const [selectedPlan, setSelectedPlan] = useState<string>(firstChoice.value);
  const [tileLimit, setTileLimit] = useState<number>(firstChoice.tileQuota);
  const [startDate, setStartDate] = useState(todayStr);
  /** "1" to "12" months, or "custom" when the expiry date is typed in */
  const [durationMonths, setDurationMonths] = useState("1");
  const [billingDay, setBillingDay] = useState<BillingDay>("start");
  const [expiryDate, setExpiryDate] = useState(() => calculateExpiry(todayStr, firstChoice.value === "Free Trial", "1"));
  const [planPrice, setPlanPrice] = useState<number>(firstChoice.price);
  const [paymentStatus, setPaymentStatus] = useState(paymentStatusFor(firstChoice));
  const [amountPaid, setAmountPaid] = useState<number>(paymentStatusFor(firstChoice) === "Paid" ? firstChoice.price : 0);
  const [paymentDate, setPaymentDate] = useState(todayStr);
  const [paymentMethod, setPaymentMethod] = useState("Bank Transfer");
  const [paymentReference, setPaymentReference] = useState("");
  const [customNotes, setCustomNotes] = useState("");

  // Calculated balance
  const balance = Math.max(0, planPrice - amountPaid);

  // ── Plan Selection Handler ────────────────────────────────────────────
  const isTrial = selectedPlan === "Free Trial";

  const handleSelectPlan = (choice: PackageChoice) => {
    setSelectedPlan(choice.value);
    const status = paymentStatusFor(choice);

    // Auto-populate price & tile limit from the saved package (Super Admin can still override)
    setPlanPrice(choice.price);
    setTileLimit(choice.tileQuota);
    setPaymentStatus(status);
    setPaymentMethod(choice.value === "Free Trial" ? "Other" : "Bank Transfer");
    setAmountPaid(status === "Paid" ? choice.price : 0);

    // Auto-calculate expiry date
    // The package's usual term is the default duration; it can still be changed
    const months = String(choice.durationMonths);
    setDurationMonths(months);
    setExpiryDate(calculateExpiry(startDate, choice.value === "Free Trial", months));
  };

  // ── Duration Change Handler ───────────────────────────────────────────
  const handleDurationChange = (value: string) => {
    setDurationMonths(value);
    if (value !== "custom") setExpiryDate(calculateExpiry(startDate, isTrial, value));
  };

  const handleStartDateChange = (newStart: string) => {
    setStartDate(newStart);
    if (isTrial || durationMonths !== "custom") setExpiryDate(calculateExpiry(newStart, isTrial, durationMonths));
  };

  // ── Password Generator ────────────────────────────────────────────────
  const generateRandomPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let pwd = "";
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(pwd);
  };

  const handleCopyPassword = () => {
    if (typeof navigator !== "undefined") {
      navigator.clipboard.writeText(password);
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 2000);
    }
  };

  // Auto-sync admin credentials if untouched
  useEffect(() => {
    if (ownerName && !adminName) {
      setAdminName(ownerName);
    }
    if (ownerName && !contactPerson) {
      setContactPerson(ownerName);
    }
  }, [ownerName]);

  useEffect(() => {
    if (email && !adminEmail) {
      setAdminEmail(email);
    }
  }, [email]);

  useEffect(() => {
    if (phone && !whatsapp) {
      setWhatsapp(phone);
    }
  }, [phone]);

  // Handle successful creation callback
  useEffect(() => {
    if (state?.success && onSuccess) {
      const timer = setTimeout(() => onSuccess(), 1500);
      return () => clearTimeout(timer);
    }
  }, [state?.success, onSuccess]);

  return (
    <form action={formAction} className="space-y-8 text-xs font-sans">
      <input type="hidden" name="role" value="SHOP" />
      <input type="hidden" name="plan" value={selectedPlan} />
      <input type="hidden" name="duration" value={isTrial ? "14 Days" : durationMonths === "custom" ? "Custom" : durationMonths === "1" ? "Monthly" : `${durationMonths} Months`} />
      {!isTrial && asDurationMonths(durationMonths) !== null && <input type="hidden" name="durationMonths" value={durationMonths} />}
      <input type="hidden" name="billingDay" value={billingDay} />
      <input type="hidden" name="balance" value={balance} />

      {/* Global Status Message */}
      {state?.message && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-2.5 transition-all shadow-xs ${
            state.success
              ? "bg-success-muted border border-success/30 text-success"
              : "bg-destructive-muted border border-destructive/30 text-destructive"
          }`}
        >
          {state.success ? (
            <Check className="w-4 h-4 shrink-0 text-success" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-destructive" />
          )}
          <span>{state.message}</span>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1: SHOP INFORMATION                                         */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="rounded-3xl bg-muted p-6 sm:p-7 border border-border space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b border-border">
          <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs">
            1
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
              Shop Information
            </h3>
            <p className="text-2xs text-muted-foreground">
              Basic commercial profile, identity, and business registrations
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Shop Name */}
          <div className="sm:col-span-2">
            <label className="ds-label">
              Shop Name <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              name="shopName"
              required
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="e.g. ABC Tiles & Ceramics"
              className="ds-field font-medium"
            />
            {state?.errors?.shopName && (
              <p className="text-destructive text-2xs mt-1 font-bold">{state.errors.shopName[0]}</p>
            )}
          </div>

          {/* Company Registration Name */}
          <div>
            <label className="ds-label">
              Shop / Company Registration Name
            </label>
            <input
              type="text"
              name="companyRegName"
              value={companyRegName}
              onChange={(e) => setCompanyRegName(e.target.value)}
              placeholder="e.g. ABC Ceramics (Pvt) Ltd"
              className="ds-field"
            />
          </div>

          {/* Owner Name */}
          <div>
            <label className="ds-label">
              Owner Name <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              name="ownerName"
              required
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="e.g. Mohamed Ahamed"
              className="ds-field font-medium"
            />
            {state?.errors?.ownerName && (
              <p className="text-destructive text-2xs mt-1 font-bold">{state.errors.ownerName[0]}</p>
            )}
          </div>

          {/* Contact Person */}
          <div>
            <label className="ds-label">
              Contact Person
            </label>
            <input
              type="text"
              name="contactPerson"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder="e.g. Mohamed Ahamed"
              className="ds-field"
            />
          </div>

          {/* Phone Number */}
          <div>
            <label className="ds-label">
              Phone Number <span className="text-destructive">*</span>
            </label>
            <input
              type="tel"
              name="phone"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +94 77 123 4567"
              className="ds-field font-medium font-mono"
            />
            {state?.errors?.phone && (
              <p className="text-destructive text-2xs mt-1 font-bold">{state.errors.phone[0]}</p>
            )}
          </div>

          {/* WhatsApp Number */}
          <div>
            <label className="ds-label">
              WhatsApp Number
            </label>
            <input
              type="tel"
              name="whatsapp"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="e.g. +94 77 123 4567"
              className="ds-field font-mono"
            />
          </div>

          {/* Email Address */}
          <div>
            <label className="ds-label">
              Email Address <span className="text-destructive">*</span>
            </label>
            <input
              type="email"
              name="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. abc@example.com"
              className="ds-field font-medium font-mono"
            />
          </div>

          {/* Website */}
          <div>
            <label className="ds-label">
              Website (Optional)
            </label>
            <input
              type="url"
              name="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://abctiles.lk"
              className="ds-field font-mono"
            />
          </div>

          {/* Business Registration No */}
          <div>
            <label className="ds-label">
              Business Registration Number (Optional)
            </label>
            <input
              type="text"
              name="businessRegNo"
              value={businessRegNo}
              onChange={(e) => setBusinessRegNo(e.target.value)}
              placeholder="e.g. PV-102934"
              className="ds-field font-mono"
            />
          </div>

          {/* Tax / VAT Number */}
          <div>
            <label className="ds-label">
              Tax / VAT Number (Optional)
            </label>
            <input
              type="text"
              name="taxVatNo"
              value={taxVatNo}
              onChange={(e) => setTaxVatNo(e.target.value)}
              placeholder="e.g. VAT-98234123"
              className="ds-field font-mono"
            />
          </div>

          {/* Shop Logo URL */}
          <div>
            <label className="ds-label">
              Shop Logo Image URL (Optional)
            </label>
            <input
              type="url"
              name="logoUrl"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="Image link or Google Drive link"
              className="ds-field"
            />
          </div>

          {/* Shop Description */}
          <div className="sm:col-span-2">
            <label className="ds-label">
              Shop Description (Optional)
            </label>
            <textarea
              name="description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Specializing in Italian vitrified tiles, rustic granite slabs, and luxury architectural bathroom concepts."
              className="ds-field leading-relaxed"
            />
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2: SHOP ADDRESS                                             */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="rounded-3xl bg-muted p-6 sm:p-7 border border-border space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b border-border">
          <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs">
            2
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
              Shop Address
            </h3>
            <p className="text-2xs text-muted-foreground">
              Physical showroom location and regional tax district
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Address Line 1 */}
          <div className="sm:col-span-2">
            <label className="ds-label">
              Address Line 1 <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              name="addressLine1"
              required
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              placeholder="e.g. 142 Galle Road, Bambalapitiya"
              className="ds-field font-medium"
            />
            {state?.errors?.addressLine1 && (
              <p className="text-destructive text-2xs mt-1 font-bold">{state.errors.addressLine1[0]}</p>
            )}
          </div>

          {/* Address Line 2 */}
          <div className="sm:col-span-2">
            <label className="ds-label">
              Address Line 2 (Optional)
            </label>
            <input
              type="text"
              name="addressLine2"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              placeholder="e.g. Ground Floor & Showroom Arcade"
              className="ds-field"
            />
          </div>

          {/* City */}
          <div>
            <label className="ds-label">
              City <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              name="city"
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Colombo"
              className="ds-field font-medium"
            />
            {state?.errors?.city && (
              <p className="text-destructive text-2xs mt-1 font-bold">{state.errors.city[0]}</p>
            )}
          </div>

          {/* District */}
          <div>
            <label className="ds-label">
              District
            </label>
            <select
              name="district"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className="ds-field cursor-pointer"
            >
              {SRI_LANKA_DISTRICTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Province */}
          <div>
            <label className="ds-label">
              Province
            </label>
            <select
              name="province"
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              className="ds-field cursor-pointer"
            >
              {SRI_LANKA_PROVINCES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Postal Code */}
          <div>
            <label className="ds-label">
              Postal Code (Optional)
            </label>
            <input
              type="text"
              name="postalCode"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="e.g. 00400"
              className="ds-field font-mono"
            />
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 3: SHOP ADMIN ACCOUNT                                      */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="rounded-3xl bg-muted p-6 sm:p-7 border border-border space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b border-border">
          <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs">
            3
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
              Shop Admin Account
            </h3>
            <p className="text-2xs text-muted-foreground">
              Authentication credentials for the showroom manager login
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Admin Name */}
          <div>
            <label className="ds-label">
              Admin Name <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              name="adminName"
              required
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="e.g. Mohamed Ahamed"
              className="ds-field font-medium"
            />
            {state?.errors?.adminName && (
              <p className="text-destructive text-2xs mt-1 font-bold">{state.errors.adminName[0]}</p>
            )}
          </div>

          {/* Admin Login Email */}
          <div>
            <label className="ds-label">
              Admin Login Email <span className="text-destructive">*</span>
            </label>
            <input
              type="email"
              name="adminEmail"
              required
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="e.g. abc@example.com"
              className="ds-field font-medium font-mono"
            />
            {state?.errors?.adminEmail && (
              <p className="text-destructive text-2xs mt-1 font-bold">{state.errors.adminEmail[0]}</p>
            )}
          </div>

          {/* Username */}
          <div>
            <label className="ds-label">
              Username (Optional)
            </label>
            <input
              type="text"
              name="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. abctiles_admin"
              className="ds-field font-mono"
            />
          </div>

          {/* Account Status */}
          <div>
            <label className="ds-label">
              Account Status
            </label>
            <select
              name="accountStatus"
              value={accountStatus}
              onChange={(e) => setAccountStatus(e.target.value as any)}
              className="ds-field cursor-pointer font-bold"
            >
              <option value="Active">Active (Immediate Login Enabled)</option>
              <option value="Suspended">Suspended (Access Temporarily Blocked)</option>
            </select>
          </div>

          {/* Temporary Password & Generator */}
          <div className="sm:col-span-2 space-y-2">
            <div className="flex items-center justify-between">
              <label className="ds-label">
                Temporary Password <span className="text-destructive">*</span>
              </label>
              <button
                type="button"
                onClick={generateRandomPassword}
                className="text-2xs font-bold text-foreground hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-success" />
                <span>Generate Password</span>
              </button>
            </div>

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Temporary Password (min. 6 characters)"
                className="ds-field pl-3.5 pr-20 font-mono font-medium"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={handleCopyPassword}
                  className="p-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Copy password to clipboard"
                >
                  {passwordCopied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            {state?.errors?.password && (
              <p className="text-destructive text-2xs mt-1 font-bold">{state.errors.password[0]}</p>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 4: SUBSCRIPTION & PAYMENT                                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="rounded-3xl bg-muted p-6 sm:p-7 border border-border space-y-6">
        <div className="flex items-center gap-3 pb-3 border-b border-border">
          <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs">
            4
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
              Subscription & Payment
            </h3>
            <p className="text-2xs text-muted-foreground">
              Commercial plan tier, tile quota limits, billing cycle, and payment settlement
            </p>
          </div>
        </div>

        {/* Plan Selection Cards */}
        <div>
          <label className="ds-label mb-2">
            Select Plan <span className="text-destructive">*</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {choices.map((choice) => {
              const isSelected = selectedPlan === choice.value;
              return (
                <button
                  type="button"
                  key={choice.value}
                  onClick={() => handleSelectPlan(choice)}
                  aria-pressed={isSelected}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary shadow-md"
                      : "bg-field border-input text-foreground hover:border-primary"
                  }`}
                >
                  <div>
                    <span className="block font-bold text-xs">{choice.label}</span>
                    <span className="block font-semibold text-sm mt-1">
                      {choice.value === "Free Trial" ? "LKR 0" : choice.value === "Custom" ? "Custom Rate" : `LKR ${choice.price.toLocaleString()}`}
                    </span>
                  </div>
                  <div className={`mt-3 pt-2 border-t flex items-center justify-between text-2xs ${isSelected ? "border-primary-foreground/25" : "border-border"}`}>
                    <span className={isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}>
                      {choice.tileQuota} tiles
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Subscription Limits & Dates Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* Tile Limit (Overridable) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="ds-label">
                Tile Limit <span className="text-destructive">*</span>
              </label>
              <span className="text-2xs text-muted-foreground font-medium">Overridable</span>
            </div>
            <div className="relative flex items-center">
              <input
                type="number"
                name="tileQuota"
                required
                min={1}
                max={10000}
                value={tileLimit}
                onChange={(e) => setTileLimit(Math.max(1, Number(e.target.value) || 1))}
                className="ds-field pl-3.5 pr-16 font-mono font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-2xs font-bold px-2 py-0.5 rounded-lg bg-secondary text-muted-foreground pointer-events-none select-none">
                tiles
              </span>
            </div>
            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 mt-2">
              {[
                { label: "50 (Trial)", val: 50 },
                { label: "100", val: 100 },
                { label: "250", val: 250 },
                { label: "500", val: 500 },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setTileLimit(opt.val)}
                  className={`px-2 py-1 rounded-lg text-2xs font-bold transition-colors cursor-pointer ${
                    tileLimit === opt.val
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Start Date */}
          <div>
            <label className="ds-label">
              Start Date <span className="text-destructive">*</span>
            </label>
            <input
              type="date"
              name="startDate"
              required
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              className="ds-field font-mono"
            />
          </div>

          {/* Billing day */}
          <div>
            <label className="ds-label">Collect the monthly fee on</label>
            <select
              value={billingDay}
              onChange={(e) => setBillingDay(asBillingDay(e.target.value))}
              className="ds-field cursor-pointer font-medium"
            >
              {(Object.keys(BILLING_DAY_LABELS) as BillingDay[]).map((k) => (
                <option key={k} value={k}>{BILLING_DAY_LABELS[k]}</option>
              ))}
            </select>
          </div>

          {/* Duration Selector */}
          <div>
            <label className="ds-label" htmlFor="create-duration">
              Subscription Duration
            </label>
            {isTrial ? (
              <input id="create-duration" type="text" readOnly value="14 days (Free Trial)" className="ds-field cursor-default font-medium" />
            ) : (
              <select
                id="create-duration"
                value={durationMonths}
                onChange={(e) => handleDurationChange(e.target.value)}
                className="ds-field cursor-pointer font-medium"
              >
                {DURATION_MONTHS.map((m) => (
                  <option key={m} value={String(m)}>{durationLabel(m)}</option>
                ))}
                <option value="custom">Custom expiry date</option>
              </select>
            )}
          </div>

          {/* Expiry Date (calculated from the start date and duration) */}
          <div className="md:col-span-3">
            <div className="flex items-center justify-between mb-1.5">
              <label className="ds-label" htmlFor="create-expiry">
                Expiry Date <span className="text-destructive">*</span>
              </label>
              <span className="text-2xs text-muted-foreground font-medium">
                {!isTrial && durationMonths === "custom" ? "Set by hand" : "Calculated from the start date and duration"}
              </span>
            </div>
            <input
              id="create-expiry"
              type="date"
              name="expiryDate"
              required
              value={expiryDate}
              readOnly={isTrial || durationMonths !== "custom"}
              onChange={(e) => setExpiryDate(e.target.value)}
              className={`ds-field font-mono font-bold ${isTrial || durationMonths !== "custom" ? "cursor-default" : ""}`}
            />
            {expiryDate && (
              <p className="mt-1.5 text-2xs text-muted-foreground">Ends on {formatLongDate(expiryDate)}.</p>
            )}
          </div>
        </div>

        {/* Payment Settlement Fields */}
        <div className="pt-3 border-t border-border space-y-4">
          <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
            Payment Settlement
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {/* Subscription Price */}
            <div>
              <label className="ds-label">
                Subscription Price (LKR)
              </label>
              <input
                type="number"
                name="planPrice"
                min={0}
                value={planPrice}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setPlanPrice(val);
                  if (paymentStatus === "Paid") setAmountPaid(val);
                }}
                className="ds-field font-mono font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>

            {/* Payment Status */}
            <div>
              <label className="ds-label">
                Payment Status
              </label>
              <select
                name="paymentStatus"
                value={paymentStatus}
                onChange={(e) => {
                  const st = e.target.value;
                  setPaymentStatus(st);
                  if (st === "Paid") setAmountPaid(planPrice);
                  else if (st === "Pending" || st === "Waived") setAmountPaid(0);
                }}
                className="ds-field cursor-pointer font-bold"
              >
                <option value="Paid">Paid (Full Settlement)</option>
                <option value="Partially Paid">Partially Paid</option>
                <option value="Pending">Pending / Invoiced</option>
                <option value="Waived">Waived (Complimentary)</option>
              </select>
            </div>

            {/* Amount Paid */}
            <div>
              <label className="ds-label">
                Amount Paid (LKR)
              </label>
              <input
                type="number"
                name="amountPaid"
                min={0}
                value={amountPaid}
                onChange={(e) => setAmountPaid(Number(e.target.value))}
                className="ds-field font-mono font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>

            {/* Balance / Outstanding */}
            <div>
              <label className="ds-label">
                Balance / Outstanding
              </label>
              <div className="w-full px-3.5 py-2.5 bg-secondary border border-input rounded-xl font-mono font-bold text-xs flex items-center justify-between text-foreground">
                <span>LKR {balance.toLocaleString()}</span>
                {balance > 0 ? (
                  <span className="text-2xs font-semibold text-warning uppercase">Due</span>
                ) : (
                  <span className="text-2xs font-semibold text-success uppercase">Clear</span>
                )}
              </div>
            </div>

            {/* Payment Date */}
            <div>
              <label className="ds-label">
                Payment Date
              </label>
              <input
                type="date"
                name="paymentDate"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="ds-field font-mono"
              />
            </div>

            {/* Payment Method */}
            <div>
              <label className="ds-label">
                Payment Method
              </label>
              <select
                name="paymentMethod"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="ds-field cursor-pointer"
              >
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cash">Cash</option>
                <option value="Card">Credit / Debit Card</option>
                <option value="Other">Other / Cheque</option>
              </select>
            </div>

            {/* Payment Reference */}
            <div className="sm:col-span-2">
              <label className="ds-label">
                Payment Reference / Receipt Number
              </label>
              <input
                type="text"
                name="paymentReference"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="e.g. TRX-982341 or Commercial Bank Slip #8912"
                className="ds-field font-mono"
              />
            </div>

            {/* Custom Agreement Notes */}
            <div className="md:col-span-4">
              <label className="ds-label">
                Agreement Notes / Custom Terms
              </label>
              <textarea
                name="notes"
                rows={2}
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                placeholder="Special agreements, multi-branch licensing clauses, or complimentary tile quota add-ons."
                className="ds-field leading-relaxed"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* FORM ACTIONS: [ Cancel ]   [ Create Shop ]                         */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-3 rounded-full border border-input bg-field text-foreground font-bold text-xs hover:bg-accent transition-colors cursor-pointer shadow-xs"
          >
            Cancel
          </button>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="ds-btn ds-btn-lg ds-btn-primary"
        >
          {isPending ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Provisioning Showroom...</span>
            </>
          ) : (
            <>
              <Store className="w-4 h-4" />
              <span>Create Shop</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
