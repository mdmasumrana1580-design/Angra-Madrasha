# আংড়া মেছবাহুল উলুম নুরানী একাডেমী — নিরাপদ অ্যাডমিন সেটআপ

এই প্যাকেজে ওয়েবসাইটের ফাইল, Cloudflare Worker API, D1 schema ও লগইনসহ অ্যাডমিন প্যানেল আছে। এটি চালু করতে Cloudflare অ্যাকাউন্টে আপনার নিজের D1 database ও Worker তৈরি/ডিপ্লয় করতে হবে। ZIP ডাউনলোড করলেই লাইভ সাইটে নিজে থেকে পরিবর্তন হবে না।

## এই প্যাকেজে কী আছে
- `sitework/` — ওয়েবসাইট ও অ্যাডমিন UI
- `src/index.js` — Worker API; লগইন, সেশন, নোটিশ প্রকাশ/মুছে ফেলা
- `migrations/0001_init.sql` — D1 ডেটাবেস টেবিল
- `wrangler.toml` — Worker ও D1 binding কনফিগারেশন
- `.dev.vars.example` — স্থানীয় পরীক্ষার জন্য উদাহরণ; বাস্তব secret এখানে রাখবেন না

## ধাপ ১ — ZIP Extract করুন
ZIP-টি কম্পিউটার বা ফোনে Extract করুন। GitHub ব্যবহার করলে Extract করা ফাইলগুলো একটি নতুন private repository-তে আপলোড করুন। `.dev.vars` বা বাস্তব পাসওয়ার্ড কখনো GitHub-এ আপলোড করবেন না।

## ধাপ ২ — Cloudflare D1 database তৈরি করুন
1. `https://dash.cloudflare.com/`-এ লগইন করুন।
2. **Storage & databases → D1 SQL Database** (মেনুর নাম কিছুটা আলাদা হতে পারে) খুলুন।
3. `angra-academy-db` নামে database তৈরি করুন।
4. Database-এর **Database ID** কপি করুন।
5. ZIP-এর `wrangler.toml` ফাইলে `database_id = "REPLACE_WITH_YOUR_D1_DATABASE_ID"` জায়গায় আপনার আসল ID বসান। `database_name`-ও ড্যাশবোর্ডে রাখা নামের সঙ্গে মিলতে হবে।

## ধাপ ৩ — GitHub থেকে Worker deploy করুন (ফোনেও সম্ভব)
1. Extract করা ফাইলগুলো GitHub repository-তে আপলোড করুন।
2. Cloudflare Dashboard → **Workers & Pages → Create application → Workers**-এ গিয়ে Git repository connect করার অপশন বেছে নিন।
3. আপনার repository connect করুন এবং deploy/build নির্দেশনায় `npx wrangler deploy` ব্যবহার করুন। যদি build command চায়, `npm install && npx wrangler deploy` দিন। Root directory হলো repository root, যেখানে `wrangler.toml` আছে।
4. Deploy-এর আগে `wrangler.toml`-এর D1 ID সঠিক আছে নিশ্চিত করুন।

Cloudflare-এর UI বা Git integration-এ অপশনের নাম আলাদা হলে Cloudflare-এর বর্তমান নির্দেশনা অনুসরণ করুন। D1 binding না থাকলে deploy সফল হলেও API কাজ করবে না।

## ধাপ ৪ — D1 migration চালান
Cloudflare-এর Git build যদি migration স্বয়ংক্রিয়ভাবে চালায় না, তাহলে Wrangler CLI-সহ কোনো কম্পিউটার/টার্মিনাল থেকে repository root-এ চালান:

```bash
npm install
npx wrangler d1 migrations apply angra-academy-db --remote
```

এটি `notices` ও `login_attempts` টেবিল তৈরি করবে। Migration সফল না হওয়া পর্যন্ত অ্যাডমিন API ব্যবহার করবেন না।

## ধাপ ৫ — গোপন Variables/Secrets সেট করুন
Cloudflare Dashboard → **Workers & Pages → আপনার Worker → Settings → Variables and Secrets**-এ যান। নিচের তিনটি মান যোগ করুন। `ADMIN_PASSWORD`-কে Secret হিসেবে যোগ করুন; অন্য দুটিকেও Secret হিসেবে রাখা উত্তম। এরপর Worker-কে redeploy করুন, যদি ড্যাশবোর্ড তা চায়।

- `ADMIN_PASSWORD` — অন্তত 16 অক্ষরের, অন্য কোথাও ব্যবহার করেননি এমন শক্তিশালী পাসওয়ার্ড। বাংলা নাম/জন্মতারিখ/ফোন নম্বর ব্যবহার করবেন না।
- `SESSION_SECRET` — কমপক্ষে 32 random bytes-এর গোপন মান। পাসওয়ার্ডের মতো একই মান দেবেন না। উদাহরণস্বরূপ, কোনো বিশ্বস্ত password manager-এর random generator দিয়ে দীর্ঘ random string বানান।

**এই মানগুলো কাউকে চ্যাটে পাঠাবেন না, স্ক্রিনশট দেবেন না, GitHub-এ রাখবেন না।** ভুলে গেলে নতুন secret সেট করে redeploy করুন।

## ধাপ ৬ — পরীক্ষা করুন
1. আপনার Worker-এর `workers.dev` ঠিকানা খুলুন।
2. `/admin.html` খুলুন; উদাহরণ `https://YOUR-WORKER.workers.dev/admin.html`।
3. ধাপ ৫-এর শুধু পাসওয়ার্ড দিয়ে লগইন করুন।
4. একটি পরীক্ষামূলক নোটিশ প্রকাশ করুন।
5. নতুন ট্যাব/অন্য ফোনে মূল সাইট খুলে নোটিশ বোর্ড ও চলমান নোটিশে সেটি দেখা যাচ্ছে কি না দেখুন।
6. অ্যাডমিন প্যানেল থেকে নোটিশ মুছে দিয়ে যাচাই করুন।

## নিরাপত্তা ও সীমাবদ্ধতা
- লগইন cookie HttpOnly, Secure, SameSite=Strict; সেশন 8 ঘণ্টা পরে শেষ হয়।
- API-তে Origin যাচাই ও প্রতি IP-তে ভুল লগইনের পর সাময়িক ব্লক আছে। এটি সম্পূর্ণ WAF/DDoS সুরক্ষার বিকল্প নয়।
- একটিমাত্র অ্যাডমিন পরিচয় (Worker Secrets) ব্যবহৃত হয়; বহু অ্যাডমিন/ভূমিকা প্রয়োজন হলে আলাদা user-management ব্যবস্থা দরকার।
- নোটিশের ডেটা D1-তে থাকে। নিয়মিত backup/export চালু করুন; গুরুত্বপূর্ণ স্কুল রেকর্ডের একমাত্র কপি হিসেবে ব্যবহার করবেন না।
- ভর্তি ফরম এই প্যাকেজে এখনো প্রকৃত আবেদন ডেটাবেসে জমা দেয় না। শিক্ষার্থীর সংবেদনশীল তথ্য, ফলাফল, ফি বা পরিচয়পত্রের তথ্য যোগ করার আগে আলাদা অ্যাক্সেস কন্ট্রোল, retention ও backup নীতি তৈরি করুন।
- এই প্যাকেজ আপনার Cloudflare অ্যাকাউন্টে নিজে থেকে deploy হয়নি। D1 ID, secrets এবং deploy আপনাকেই সম্পন্ন করতে হবে।

## আপডেটেড ভর্তি ও ফি ব্যবস্থাপনা

এই সংস্করণে ভর্তি আবেদন D1-এ সংরক্ষণ, অ্যাডমিন থেকে আবেদন দেখা/অবস্থা বদল/মুছে ফেলা এবং ফি রেকর্ড যোগ/দেখা/মুছে ফেলার API যুক্ত করা হয়েছে। শিক্ষক/শিক্ষার্থী ফর্ম এখন Worker-এর multipart FormData API-র সঙ্গে সামঞ্জস্যপূর্ণ এবং অ্যাডমিন প্যানেলে লগইন ফর্ম রয়েছে।

### আপডেট প্রকাশের আগে
1. আপনার বর্তমান GitHub রিপোজিটরিতে এই ZIP-এর ফাইলগুলো আপলোড/রিপ্লেস করুন; পুরোনো `wrangler.toml`-এর `database_id` অবশ্যই আপনার নিজের D1 ডেটাবেসের ID কি না যাচাই করুন। ভুল ID থাকলে নিজের D1 ID বসান।
2. Cloudflare Worker secrets-এ `ADMIN_PASSWORD`, `SESSION_SECRET` সেট করুন। `SESSION_SECRET` দীর্ঘ ও এলোমেলো গোপন মান হবে; এটি কাউকে দেবেন না।
3. নতুন migration-সহ সব migration চালান: `npx wrangler d1 migrations apply angra-academy-db --remote`
4. R2 bucket `angra-academy-photos` এবং `PHOTOS` binding ঠিক আছে কি না নিশ্চিত করুন।
5. `npx wrangler deploy` চালান। Pages Git integration দিয়ে deploy হলে আপনার repository-এর build/deploy সেটিংস অনুযায়ী নতুন commit push করুন।
6. `/admin.html` খুলে Worker secret-এ সেট করা পাসওয়ার্ড দিয়ে লগইন করে শিক্ষক/শিক্ষার্থী/নোটিশ/ভর্তি/ফি পরীক্ষা করুন। public ভর্তি ফরমও একটি test submission দিয়ে পরীক্ষা করুন।

**গুরুত্বপূর্ণ সীমা:** এই আপডেটে ফি রেকর্ড সংরক্ষণ/জমা/বকেয়া হিসাব আছে, কিন্তু অনলাইন পেমেন্ট, স্বয়ংক্রিয় রসিদ PDF, উপস্থিতি, পরীক্ষার ফলাফল বা প্রতিটি পাবলিক ওয়েবসাইটের লেখা/ব্যানার অ্যাডমিন থেকে সম্পাদনার UI এখনো নেই। ডেপ্লয় ও D1 migration/secret configuration এই ZIP নিজে থেকে করতে পারে না।
