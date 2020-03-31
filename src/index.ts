import puppeteer from "puppeteer";
import pino from "pino";
import systeminfo from "systeminformation";
import pb from "pretty-bytes";
import dotenv from "dotenv-safe";

dotenv.config();

const logger = pino();
logger.info("Starting KPN Unlimited...");

const bookMoreData = async () => {
  logger.info("Booking extra data for " + process.env.NUMBER!);
  const browser = await puppeteer.launch({
    defaultViewport: { width: 1200, height: 900 }
  });
  const page = await browser.newPage();

  const waitForAndClick = async (selector: string) => {
    try {
      await page.waitForSelector(selector);
      await page.click(selector);
    } catch (e) {
      logger.error(`Error while clicking ${selector}`);
      throw e;
    }
  };

  try {
    await page.goto("https://mijn.kpn.com");
    await page.waitForSelector("#username");

    await page.type("#username", process.env.USERNAME!);
    await page.type("#password", process.env.PASSWORD!);
    await waitForAndClick("#btn-login");

    logger.info("Logged in");
    await waitForAndClick(".ProductenTab");
    await waitForAndClick(".mobiel_" + process.env.NUMBER!);
    await waitForAndClick(".extra_bundles_quick_link");
    await waitForAndClick(
      "#kpn-subscription div.panel-body > ul > li:nth-child(1)"
    );
    await waitForAndClick(
      "#kpn-subscription roaming-bundle-assistent > div:nth-child(1) > div.margin-top-double > div > div"
    );

    await page.waitForSelector("#agree");
    await page.evaluate(() => {
      document?.querySelector("#agree")?.parentElement?.click();
    });

    const priceField = await page.$(
      "#kpn-subscription .panel-body > div > div > div:nth-child(1) > .col-xs-4.col-lg-3.text-right > p"
    );
    if (!priceField) {
      throw new Error("No price field detected.");
    }

    const price = await page.evaluate(e => e.textContent, priceField);

    if (String(price).trim() !== "€ 0,00") {
      throw new Error("Price isn't free (" + price + ")");
    }

    await waitForAndClick("#btn-confirm:not(.disabled)");

    await page.waitForSelector(".alert.alert-success");

    await browser.close();
    logger.info("Booked extra data 🚀");
  } catch (e) {
    logger.error(e.message);
    await page.screenshot({
      fullPage: true,
      path: "error_" + Date.now() + ".png"
    });
  }
};

if (process.env.MODE! === "bytes") {
  logger.info("Using byte mode, booking new data every 900 MB of traffic.");
  let lastByteCounter = 0;
  setInterval(async () => {
    const [{ rx_bytes, tx_bytes }] = await systeminfo.networkStats();
    const bytes = rx_bytes + tx_bytes;

    if (lastByteCounter === 0) {
      lastByteCounter = bytes;
      return;
    }

    if (bytes > lastByteCounter + 943718400) {
      logger.info(`Another ${pb(bytes - lastByteCounter)} have been used.`);
      await bookMoreData();
      lastByteCounter = bytes;
    }
  }, 10000);
} else {
  const interval = Number(process.env.INTERVAL || 5);
  logger.info(`Using time mode, booking new data every ${interval} minutes.`);
  setInterval(bookMoreData, interval * 60000);
  bookMoreData();
}
