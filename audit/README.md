# BoothPro Audit

Run locally with:

    node audit/boothpro-audit.mjs

Override the production URL with:

    BOOTHPRO_URL=https://booth-pro-app.vercel.app node audit/boothpro-audit.mjs

Exit code 2 means a critical finding. Exit code 3 means warnings are configured as blocking.
