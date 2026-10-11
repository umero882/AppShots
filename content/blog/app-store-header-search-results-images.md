---
slug: app-store-header-search-results-images
title: "App Store header & search results images: sizes, safe areas and In-App Event art (iOS 27)"
description: "Apple's new product-page header and search results card for iOS 27: exact sizes, safe areas, video rules, In-App Event media, and how to make them in AppShots."
category: screenshots
tags: ios-27, app-store-connect, in-app-events
---

With iOS 27 and iPadOS 27, the App Store product page gets a new hero: a wide **header** image across the top of the page, above your icon and name. Search results get one as well, a **search results** card that can stand in for your first screenshots when someone finds you by keyword. Both are uploaded in App Store Connect under **Product Page Information → Header and Search Results**, next to the screenshots you already ship.

This guide covers the exact sizes Apple accepts, the safe areas that survive cropping on iPhone and iPad, how In-App Event media fits alongside them, and how to make all of it in AppShots.

## The sizes Apple accepts

Apple's [creative assets specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications/) list two kinds of upload: one image per placement, or a single universal image used for both.

| Asset | Aspect ratio | Size (px) | Formats |
|---|---|---|---|
| Product page header | 21:9 | 3840 × 1646 | PNG, JPEG |
| Search results card | 3:2 | 1920 × 1280 up to 3840 × 2560 | PNG, JPEG |
| Universal (header + search) | 16:9 | 5244 × 2950 | PNG only |

A few rules apply to all of them:

- **No transparency.** Flatten onto a solid or gradient background. An alpha channel gets the upload rejected.
- **Exact pixels.** A 3839-pixel-wide header is rejected the same way an off-by-one screenshot is.
- **Video is allowed** for the header and the search card at the same sizes: 5 to 30 seconds, 30 or 60 fps, `.mov`, `.m4v` or `.mp4`. It plays muted and loops, so it has to make sense with no sound.

## Design for the safe area, not the canvas

The canvas is big because the App Store crops it differently on every device. A 13-inch iPad shows most of the header; an iPhone in portrait shows a narrow band in the middle. Anything outside the **safe area** can disappear.

Measured from Apple's templates:

| Asset | Canvas | Safe area | Position (x, y) |
|---|---|---|---|
| Header 21:9 | 3840 × 1646 | 1646 × 661 | 1097, 493 |
| Search 3:2 | 3840 × 2560 | 2168 × 1030 | 836, 765 |
| Universal 16:9 | 5244 × 2950 | 1402 × 962 | 1921, 660 |

What that means in practice:

- **Headline and phone mockup go inside the safe area.** Treat everything else as background: gradient, texture, product colour.
- **Shorter copy than a screenshot.** A screenshot caption can run 40 characters. In the header's safe area, aim for 2–5 words, at most about 28 characters. The universal image's safe area is tiny, so keep it under about 24.
- **One promise, not a feature list.** The header sets the tone for the whole page. The search card has a different job: give the single clearest reason to tap your app over the others in the results.

## In-App Event media

[In-App Events](https://developer.apple.com/app-store/in-app-events/) such as challenges, launches, seasonal sales and live sessions use their own artwork:

| Asset | Aspect ratio | Size (px) | Video |
|---|---|---|---|
| Event card | 16:9 | 1920 × 1080 up to 3840 × 2160 | 15–30 s |
| Event details page | 9:16 | 1080 × 1920 up to 2160 × 3840 | 15–30 s |

Apple doesn't publish a safe area for event media, but the store draws over parts of it. The event card is cropped slightly at the sides. On the details page, the event name, description and **Get** button cover roughly the bottom quarter. Keep your subject in the upper-middle of the frame.

One rule specific to events: **don't repeat the event name in the artwork.** The App Store already prints the name and short description right next to it. Use the image for what the text can't carry: a date, a reward, a feeling.

## How to make them in AppShots

1. Open a project and go to the **Device** tab.
2. At the top, switch from **Screenshots** to **Header & Search** or **In-App Events**.
3. Pick the size: *Header 21:9*, *Search 3:2*, *Universal 16:9*, *Event card 16:9* or *Event details 9:16*. The canvas switches to Apple's exact pixels.
4. Choose a **mockup device**. Your existing screenshots appear inside that phone, so a header can reuse the set you already made.
5. Keep the headline and phone inside the dashed **Safe area** box. It only shows in the editor, never in the export.
6. Export a **PNG or JPG** (the universal image is PNG-only), or **All sizes** to get the whole pack in one zip. **Video** records a looping clip at the right length: 5–30 s for header and search, 15–30 s for events.
7. Upload in App Store Connect: **Product Page Information → Header and Search Results** for the placements, or **In-App Events** for event media.

### Let the AI write the short version

The AI copywriter in the **Text** tab knows which placement you're designing for. On a header it writes one brand-level promise of up to about 28 characters. On a search card it writes the clearest reason to tap, and on event media it writes a short hook that doesn't repeat the event name. **Write all** gives you a different angle for each screen in the project, so you can test them against each other.

## Checklist before you upload

- Exact size for the placement, and no transparency
- Headline and mockup inside the safe area
- Copy short enough to read on an iPhone in portrait
- Event art doesn't repeat the event name
- Video (if any) is muted-friendly, loops cleanly, and is `.mov`, `.m4v` or `.mp4`

The header is the first thing people see on your product page, and the search card is what they see when deciding whether to tap. Both are worth the same care as your first screenshot. [Make yours in AppShots](/signup), free.
