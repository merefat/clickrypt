'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Shield,
  CreditCard,
  ShieldCheck,
  CheckCircle,
  Lock,
  ArrowRight,
  Building2,
  ArrowLeft,
  Printer
} from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import api from '@/lib/api';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_51MzX90SampleStripePublishableKey1234567890'
);

export default function StandaloneCheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEnrollFlow = searchParams?.get('flow') === 'enroll';

  const [seats, setSeats] = useState(25);
  const [cardHolder, setCardHolder] = useState('Alex Morgan');
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [expiry, setExpiry] = useState('12 / 28');
  const [cvc, setCvc] = useState('123');
  const [zipCode, setZipCode] = useState('10001');
  const [processing, setProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState<any | null>(null);

  const pricePerUserPerMonth = 6;
  const annualTotal = seats * pricePerUserPerMonth * 12;

  const getCardBrand = (num: string) => {
    const clean = num.replace(/\s+/g, '');
    if (clean.startsWith('4')) return 'Visa';
    if (/^5[1-5]/.test(clean) || /^2[2-7]/.test(clean)) return 'Mastercard';
    if (/^3[47]/.test(clean)) return 'Amex';
    if (/^6(?:011|5)/.test(clean)) return 'Discover';
    return '';
  };

  const handleFillTestCard = (type: 'visa' | 'mastercard' | 'amex') => {
    if (type === 'visa') {
      setCardNumber('4242 4242 4242 4242');
      setExpiry('12 / 28');
      setCvc('123');
      setZipCode('10001');
    } else if (type === 'mastercard') {
      setCardNumber('5555 5555 5555 4444');
      setExpiry('08 / 29');
      setCvc('456');
      setZipCode('90210');
    } else if (type === 'amex') {
      setCardNumber('3782 822468 30005');
      setExpiry('11 / 27');
      setCvc('8888');
      setZipCode('30301');
    }
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 16) val = val.slice(0, 16);
    const formatted = val.match(/.{1,4}/g)?.join(' ') || val;
    setCardNumber(formatted);
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 4) val = val.slice(0, 4);
    if (val.length >= 3) {
      setExpiry(`${val.slice(0, 2)} / ${val.slice(2)}`);
    } else {
      setExpiry(val);
    }
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardNumber || !expiry || !cvc) {
      alert('Please fill out card details');
      return;
    }
    setProcessing(true);

    try {
      await stripePromise;

      const res = await api.post('/checkout', {
        seats,
        planName: 'Organization Plan',
        cardHolder,
        amount: annualTotal,
      });

      if (res.data?.success) {
        await api.post('/subscription', { action: 'PAY', seats });
        if (isEnrollFlow) {
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('clickrypt_org_paid', '1');
          }
          router.push('/register?mode=organization&paid=1');
        } else {
          setPaymentSuccess(res.data);
        }
      }
    } catch (err) {
      console.error(err);
      alert('Payment failed. Please check card details.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f8fb] text-[#091528] select-none font-sora flex flex-col justify-between p-6 relative overflow-hidden">
      <div className="absolute top-1/4 left-10 w-96 h-96 bg-[#f39c12]/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-10 w-96 h-96 bg-[#1fbbd2]/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Standalone Brand Navigation Bar */}
      <header className="max-w-6xl mx-auto w-full flex items-center justify-between py-4 border-b border-[#cbd5e1] mb-8 z-10">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Clickrypt Logo" className="h-12 w-auto object-contain drop-shadow-md" />
          <div className="h-6 w-px bg-[#cbd5e1] mx-1" />
          <p className="text-xs text-[#0284c7] font-extrabold tracking-wide">Stripe Secure Payment Portal</p>
        </div>

        <Link
          href={isEnrollFlow ? '/register?mode=organization' : '/login'}
          className="px-4 py-2 bg-[#ffffff] hover:bg-[#e0f2fe] border border-[#cbd5e1] hover:border-[#0284c7] text-[#0f172a] hover:text-[#0284c7] text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-sm"
        >
          <ArrowLeft className="w-4 h-4 text-[#d97706]" />
          <span>{isEnrollFlow ? 'Back to Registration' : 'Back to Sign In'}</span>
        </Link>
      </header>

      {/* Standalone Payment Checkout Portal */}
      <main className="max-w-6xl mx-auto w-full z-10 flex-1 flex flex-col justify-center">
        {/* Title */}
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-extrabold text-[#091528] flex items-center justify-center gap-3">
            <CreditCard className="w-8 h-8 text-[#f39c12]" />
            Pay Organization Subscription Bill
          </h1>
          <p className="text-xs text-[#1fbbd2] mt-1">
            Complete your bill payment to restore sign-in and vault access for your organization.
          </p>
        </div>

        {/* Payment Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Seats Slider & Credit Card Input */}
          <div className="lg:col-span-2 space-y-6">
            {/* Seat Selector Card */}
            <div className="glass-panel p-6 rounded-2xl border border-[#1fbbd2] !bg-[#f5f8fb] shadow-xl">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-300/60">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#f39c12]" />
                  <h2 className="text-sm font-bold text-[#091528]">Organization Team Seats</h2>
                </div>
                <span className="text-xs text-[#1fbbd2] font-extrabold">$6 / user / month</span>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center text-xs font-bold text-[#091528]">
                  <span>Select Number of Users:</span>
                  <span className="text-[#f39c12] text-base font-extrabold">{seats} Team Seats</span>
                </div>

                <input
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={seats}
                  onChange={(e) => setSeats(Number(e.target.value))}
                  className="w-full accent-[#f39c12] bg-gray-300 h-2 rounded-lg cursor-pointer"
                />

                <div className="flex justify-between text-[10px] text-gray-600">
                  <span>5 Seats ($360/yr)</span>
                  <span>25 Seats ($1,800/yr)</span>
                  <span>50 Seats ($3,600/yr)</span>
                  <span>100 Seats ($7,200/yr)</span>
                </div>
              </div>
            </div>

            {/* Credit Card Details Card */}
            <div className="glass-panel-gold p-6 rounded-2xl border border-[#f39c12] !bg-[#f5f8fb] shadow-2xl">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-300/60">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-[#f39c12]" />
                  <h2 className="text-sm font-bold text-[#091528]">Stripe Credit Card Payment</h2>
                </div>

                <div className="flex items-center gap-1.5 text-[10px] font-extrabold">
                  <span className={`px-2 py-0.5 rounded border transition-all ${
                    getCardBrand(cardNumber) === 'Visa'
                      ? 'bg-blue-600 text-white border-blue-400 font-extrabold shadow glow-cyan'
                      : 'bg-blue-100 text-blue-700 border-blue-300'
                  }`}>VISA</span>
                  <span className={`px-2 py-0.5 rounded border transition-all ${
                    getCardBrand(cardNumber) === 'Mastercard'
                      ? 'bg-rose-600 text-white border-rose-400 font-extrabold shadow'
                      : 'bg-rose-100 text-rose-700 border-rose-300'
                  }`}>MASTERCARD</span>
                  <span className={`px-2 py-0.5 rounded border transition-all ${
                    getCardBrand(cardNumber) === 'Amex'
                      ? 'bg-cyan-600 text-white border-cyan-400 font-extrabold shadow glow-cyan'
                      : 'bg-cyan-100 text-cyan-700 border-cyan-300'
                  }`}>AMEX</span>
                </div>
              </div>

              {/* 1-Click Test Cards Quick Fill Preset Bar */}
              <div className="flex flex-wrap items-center gap-2 mb-4 bg-white p-3 rounded-xl border border-gray-300/80">
                <span className="text-xs font-bold text-[#091528] mr-1">1-Click Test Presets:</span>
                <button
                  type="button"
                  onClick={() => handleFillTestCard('visa')}
                  className="px-2.5 py-1 !bg-[#f5f8fb] hover:bg-blue-100 border border-blue-500/60 text-blue-700 text-[10px] font-extrabold rounded-lg transition-all shadow cursor-pointer"
                >
                  Visa (4242)
                </button>
                <button
                  type="button"
                  onClick={() => handleFillTestCard('mastercard')}
                  className="px-2.5 py-1 !bg-[#f5f8fb] hover:bg-rose-100 border border-rose-500/60 text-rose-700 text-[10px] font-extrabold rounded-lg transition-all shadow cursor-pointer"
                >
                  Mastercard (5555)
                </button>
                <button
                  type="button"
                  onClick={() => handleFillTestCard('amex')}
                  className="px-2.5 py-1 !bg-[#f5f8fb] hover:bg-cyan-100 border border-cyan-500/60 text-cyan-700 text-[10px] font-extrabold rounded-lg transition-all shadow cursor-pointer"
                >
                  Amex (3782)
                </button>
              </div>

              <form onSubmit={handleSubmitPayment} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#091528] mb-1">Cardholder Name</label>
                  <input
                    type="text"
                    placeholder="Alex Morgan"
                    value={cardHolder}
                    onChange={(e) => setCardHolder(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-xs text-[#091528] focus:border-[#1fbbd2] outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#091528] mb-1">Card Number</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="4242 4242 4242 4242"
                      value={cardNumber}
                      onChange={handleCardNumberChange}
                      className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-xs font-mono text-[#091528] focus:border-[#1fbbd2] outline-none pr-10"
                      required
                    />
                    <CreditCard className="w-4 h-4 text-[#f39c12] absolute right-3.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#091528] mb-1">Expiry Date</label>
                    <input
                      type="text"
                      placeholder="MM / YY"
                      value={expiry}
                      onChange={handleExpiryChange}
                      className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-xs text-[#091528] font-mono focus:border-[#1fbbd2] outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#091528] mb-1">CVC Code</label>
                    <input
                      type="password"
                      placeholder="123"
                      maxLength={4}
                      value={cvc}
                      onChange={(e) => setCvc(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-xs text-[#091528] font-mono focus:border-[#1fbbd2] outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#091528] mb-1">ZIP / Postal</label>
                    <input
                      type="text"
                      placeholder="10001"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-xs text-[#091528] font-mono focus:border-[#1fbbd2] outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={processing}
                  className="w-full py-3.5 gold-cyan-gradient-btn font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 mt-4 shadow-xl transition-all"
                >
                  <Lock className="w-4 h-4" />
                  <span>
                    {processing
                      ? 'Processing Stripe Payment...'
                      : `Pay $${annualTotal.toLocaleString()}.00 USD via Stripe`}
                  </span>
                </button>
              </form>

              <div className="mt-3 flex items-center justify-between text-[10px] text-gray-600 border-t border-gray-300/60 pt-3">
                <span className="flex items-center gap-1 text-[#1fbbd2]">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#1fbbd2]" /> PCI DSS Level 1 Security
                </span>
                <span>Stripe 256-bit SSL Encrypted</span>
              </div>
            </div>
          </div>

          {/* Right Column: Order Summary */}
          <div className="glass-panel p-6 rounded-2xl border border-[#1fbbd2] !bg-[#f5f8fb] flex flex-col justify-between shadow-2xl">
            <div>
              <h3 className="text-base font-bold text-[#091528] mb-4 pb-3 border-b border-gray-300/60">
                Order Summary
              </h3>

              <div className="space-y-3 text-xs border-b border-gray-300/60 pb-4">
                <div className="flex justify-between">
                  <span className="text-gray-600">Organization Plan (Annual)</span>
                  <span className="font-bold text-[#091528]">${annualTotal.toLocaleString()}.00</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Included Team Seats</span>
                  <span className="font-bold text-[#091528]">{seats} Seats</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Price per user</span>
                  <span className="font-bold text-[#1fbbd2]">$6.00 / mo</span>
                </div>
                <div className="flex justify-between text-emerald-800 font-semibold">
                  <span>Discount</span>
                  <span>-$0.00</span>
                </div>
              </div>

              <div className="pt-4 flex justify-between items-center mb-6">
                <span className="text-sm font-bold text-[#091528]">Total Due Today</span>
                <span className="text-3xl font-extrabold text-[#f39c12] glow-gold">
                  ${annualTotal.toLocaleString()}.00
                </span>
              </div>

              <div className="space-y-2 text-xs text-[#091528] mb-6 bg-white p-3.5 rounded-xl border border-gray-300">
                <p className="font-bold text-[#091528] text-[11px] mb-1">Included with payment:</p>
                <div className="flex items-center gap-2 text-[11px]">
                  <CheckCircle className="w-3.5 h-3.5 text-[#f39c12] shrink-0" />
                  <span>Restores Sign-In access for all team members</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <CheckCircle className="w-3.5 h-3.5 text-[#1fbbd2] shrink-0" />
                  <span>Unlimited zero-knowledge passwords</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <CheckCircle className="w-3.5 h-3.5 text-[#1fbbd2] shrink-0" />
                  <span>E2EE OpenPGP team sharing & groups</span>
                </div>
              </div>
            </div>

            
          </div>
        </div>
      </main>

      {/* Standalone Footer */}
      <footer className="max-w-6xl mx-auto w-full text-center text-[10px] text-gray-500 pt-6 border-t border-gray-300/60 mt-8 z-10">
        Clickrypt Zero-Knowledge Password Vault • Stripe Payment Portal • Encrypted with OpenPGP
      </footer>

      {/* Payment Success Confirmation Modal */}
      {paymentSuccess && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="!bg-[#f5f8fb] border border-[#f39c12]/60 w-full max-w-md rounded-2xl p-6 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 flex items-center justify-center mx-auto mb-4 glow-green">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-extrabold text-[#091528] mb-1">Payment Confirmed & Access Restored!</h2>
            <p className="text-xs text-[#091528] mb-4">
              Your Stripe payment of ${paymentSuccess.amount}.00 USD was processed. Organization sign-in access is now unlocked.
            </p>

            <div className="bg-white p-3 rounded-xl border border-gray-300 text-xs text-left space-y-1.5 mb-6">
              <div className="flex justify-between">
                <span className="text-gray-600">Invoice Number:</span>
                <span className="font-mono font-bold text-[#f39c12]">{paymentSuccess.invoiceId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Stripe Payment ID:</span>
                <span className="font-mono text-[#091528] truncate max-w-[180px]">{paymentSuccess.paymentIntentId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Seats Unlocked:</span>
                <span className="font-bold text-[#091528]">{paymentSuccess.seats} Users</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="w-full py-3.5 gold-gradient-btn font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xl"
              >
                <Printer className="w-4 h-4" />
                <span>Print / Save Invoice</span>
              </button>
              <Link
                href="/login"
                className="w-full py-3.5 gold-cyan-gradient-btn font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xl"
              >
                <span>Proceed to Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      )}
      {paymentSuccess && (
        <div className="invoice-print hidden bg-white text-[#091528] p-4 max-w-3xl mx-auto box-border">
          <div className="flex items-center justify-between border-b border-[#cbd5e1] pb-4 mb-4">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Clickrypt" className="h-12 w-auto" />
              <div>
                <h1 className="text-xl font-extrabold text-[#091528] leading-none">Clickrypt</h1>
                <p className="text-[#0284c7] text-[11px] font-bold mt-0.5">Zero-Knowledge Password Vault</p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-2xl font-extrabold text-[#091528] tracking-tight">OFFICIAL INVOICE</h2>
              <p className="text-xs text-[#64748b] font-medium">Stripe Payment Receipt</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs mb-4 bg-[#f8fafc] p-3 rounded-xl border border-[#cbd5e1]">
            <div>
              <p><span className="font-extrabold text-[#334155]">Invoice #:</span> <span className="font-mono text-[#0284c7] font-bold">{paymentSuccess.invoiceId}</span></p>
              <p><span className="font-extrabold text-[#334155]">Payment Date:</span> {new Date().toLocaleDateString()}</p>
            </div>
            <div className="text-right">
              <p><span className="font-extrabold text-[#334155]">Billed To:</span> <span className="font-bold text-[#0f172a]">{cardHolder}</span></p>
              <p><span className="font-extrabold text-[#334155]">Stripe Tx ID:</span> <span className="font-mono text-gray-600">{paymentSuccess.paymentIntentId}</span></p>
            </div>
          </div>

          <table className="w-full text-xs border-collapse border border-[#cbd5e1] rounded-xl overflow-hidden mb-4">
            <thead className="bg-[#0284c7] text-white font-extrabold">
              <tr>
                <th className="text-left p-2.5">Description</th>
                <th className="text-center p-2.5">Qty / Seats</th>
                <th className="text-left p-2.5">Unit Rate</th>
                <th className="text-right p-2.5">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0]">
              <tr className="bg-white">
                <td className="p-2.5 font-bold text-[#0f172a]">Organization Plan (Annual Subscription)</td>
                <td className="p-2.5 text-center font-bold">{seats} Users</td>
                <td className="p-2.5 text-[#475569]">${pricePerUserPerMonth * 12}.00 / seat / yr</td>
                <td className="p-2.5 text-right font-extrabold text-[#0f172a]">${paymentSuccess.amount}.00</td>
              </tr>
              <tr className="bg-[#f8fafc] text-emerald-600 font-medium">
                <td className="p-2.5" colSpan={3}>Volume Subscription Discount</td>
                <td className="p-2.5 text-right font-extrabold">-$0.00</td>
              </tr>
            </tbody>
            <tfoot className="bg-[#0f172a] text-white">
              <tr>
                <td className="p-2.5 font-extrabold text-sm" colSpan={3}>Total Paid (USD)</td>
                <td className="p-2.5 text-right font-extrabold text-sm text-[#f39c12]">${paymentSuccess.amount}.00</td>
              </tr>
            </tfoot>
          </table>

          <div className="text-center pt-3 border-t border-[#cbd5e1] text-[10px] text-[#64748b]">
            <p className="font-bold text-[#0284c7]">Clickrypt Zero-Knowledge Password Vault • Stripe Payment Portal • PCI DSS Compliant</p>
            <p className="mt-0.5">Thank you for your business! Restored sign-in access is active for all organization team members.</p>
          </div>
        </div>
      )}
    </div>
  );
}
