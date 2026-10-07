# Data

## `flipkart-play-store-reviews.csv`

Sample input for the upload form: 500 public Google Play reviews of the Flipkart Android app (`com.flipkart.android`, India store).

| Column | Description |
|---|---|
| Date | Review date (all rows in this sample: 2026-10-05) |
| Rating | 1–5 stars |
| Title | Review title (usually empty) |
| Review | Review text, which is what the workflow analyses |
| App version | App version the reviewer was on |
| Helpful votes | Play Store helpful-vote count |
| Developer reply | Flipkart's public reply, if any |
| Reply date | Date of the developer reply |
| Review URL | Public link to the review |

The file has no reviewer names or user IDs.

> **Note:** this sample covers a single day. The form asks for 8–12 weeks of reviews, so use a wider export for a true weekly/trend view.

To use your own data, upload any CSV with a review-text column through the form.
