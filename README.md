# BlogBhai

একটা ব্যক্তিগত বাংলা কনটেন্ট সহকারী। স্ক্রিপ্ট, শিরোনাম, বর্ণনা, ট্যাগ, উৎস তালিকা আর CapCut web-এর প্রম্পট তৈরি করে। ভিডিও বানানো ও আপলোড ব্যবহারকারী নিজে করেন।

## কী কী ফ্রি সার্ভিস ব্যবহার হয়

- Cloudflare Workers (ফ্রি প্ল্যান): পেজ ও API চালায়
- Google Gemini API (ফ্রি টিয়ার): একটাই মডেল: `gemini-3.6-flash`
- GitHub Actions: কোড টেস্ট করে Cloudflare-এ deploy করে

## চালু করতে যা লাগে (একবারই)

GitHub → এই repo → Settings → Secrets and variables → Actions → New repository secret. নিচের চারটি যোগ করুন:

| নাম | কী দিতে হবে |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare-এর API token (টেমপ্লেট: Edit Cloudflare Workers) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare অ্যাকাউন্ট আইডি |
| `GEMINI_API_KEY` | Google AI Studio-র API key |
| `APP_PASSWORD` | পেজ খোলার পাসওয়ার্ড (নিজে ঠিক করুন, লম্বা রাখুন) |

এরপর `blogbhai` branch-এ কোনো পরিবর্তন push হলে GitHub Actions টেস্ট চালিয়ে deploy করে।

## ফাইল

- `worker.js`: সার্ভার। পেজ দেখায় এবং মডেলের সাথে কথা বলে। মডেলের নাম এখানে।
- `page.js`: চ্যাট পেজ (ফোন ও কম্পিউটার দুটোতেই চলে)।
- `rules.js`: BlogBhai-এর নিয়মাবলি ও নোট। এটাই এজেন্টের স্মৃতি; প্রতিটি অনুরোধে মডেলের কাছে যায়।
- `test/run-tests.mjs`: স্বয়ংক্রিয় পরীক্ষা। আসল মডেল ডাকে না।
- `.github/workflows/deploy-blogbhai.yml`: টেস্ট ও deploy।

## গোপনীয়তা

এই repo public। এখানে কোনো চাবি, পাসওয়ার্ড বা ব্যক্তিগত তথ্য রাখা হবে না। সেগুলো শুধু GitHub Secrets-এ থাকে।

## স্থানীয়ভাবে পরীক্ষা

```
npm test
```
