<?php

namespace App\Http\Controllers;

use App\Collivery\ShopifyClient;
use App\Model\Shop;
use Carbon\Carbon;
use Illuminate\Contracts\Logging\Log;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Input;
use Illuminate\Support\Facades\Log;

/**
 * Handles installation and registration of webhooks.
 */
class ShopController extends Controller
{
    /**
     * @var Log
     */
    private $logger;

    public function __construct(Log $logger)
    {
        $this->middleware('auth');
        $this->middleware('shopify', ['except' => ['requestPermissions']]);
        $this->logger = $logger;
    }

    public function setup(Request $request)
    {
        $shop = $this->getShop($request);
        if ($shop) {
            $client = new ShopifyClient($shop->shop, null, config('shopify.api_key'), config('shopify.secret'));

            try {
                $shop->access_token = $client->getAccessToken($request->input('code'));
                $client->setAccessToken($shop->access_token);
                if (!$this->setShopInfo($shop, $client)) {
                    throw new \Exception('Setting shop address failed');
                }

                $shop->save();
                $this->registerWebhooks($shop);
                $request->session()->flash('shop_success', 'Shop setup complete');
            } catch (\Exception $e) {
                $request->session()->flash('shop_error', 'Shop setup failed');
            }
        }

        return redirect('/');
    }

    /**
     * @param Request $request
     *
     * @return Shop
     */
    public function getShop(Request $request)
    {
        return Shop::where('shop', $request->input('shop'))->where('nonce', $request->input('state'))->first();
    }

    private function setShopInfo(Shop $shop, ShopifyClient $client)
    {
        try {
            $shopInfo = $client->call('GET', '/admin/shop.json', ['id']);
            $shop->setInfo($shopInfo);
            return true;
        } catch (\Exception $e) {
            Log::error($e);

            return false;
        } finally {
        }
    }

    private function registerWebhooks(Shop $shop)
    {
        $client = $this->getShopifyClient($shop);

        $service = null;
        try {
            $this->registerCarrier($service, $client, $shop);
            //register webhooks
            $webhooks = json_decode(file_get_contents(resource_path('json/webhooks.json')), true);
            $hookDomain = config('app.url');

            if (config('app.debug')) {
                $hookDomain = env('NGROK_URL');
            }

            foreach ($webhooks as $key => &$hook) {
                $hook = [
                    'webhook' => [
                        'topic' => "$hook",
                        'address' => "$hookDomain/service/$hook",
                        'format' => 'json',
                    ],
                ];
                $client->call('POST', '/admin/webhooks.json', $hook);
            }

            //script tags
            $client->call('POST', '/admin/script_tags.json', [
                'script_tag' => [
                    'src' => "${hookDomain}/js/store-front.js",
                    'event' => 'onload',
                    'display_scope' => 'all',
                ],
            ]);

            $shop->webhooks_installed = 1;
            $shop->webhooks_installed_on = Carbon::now();

            $shop->app_installed = 1;
            $shop->app_installed_on = Carbon::now();

            if ($shop->save()) {
                return true;
            } else {
                throw new \Exception('Error Processing Request', 1);
            }
        } catch (\Exception $e) {
            $this->logger->error($e);
        }

        return false;
    }

    /**
     * @param                $service
     * @param \ShopifyClient $client
     * @param Shop           $shop
     */
    private function registerCarrier(&$service, \ShopifyClient $client, Shop $shop)
    {
        $payload = [
            'name' => config('shopify.app_name'),
            'callback_url' => config('shopify.shipping_endpoint'),
            'service_discovery' => true,
        ];

        if (config('app.debug')) {
            $payload['callback_url'] = env('NGROK_URL').'/service/shipping/rates';
        }

        $service = $client->call('POST', '/admin/carrier_services.json', [
            'carrier_service' => $payload,
        ]);
        $shop->carrier_id = $service['id'];
        $shop->carrier_installed = 1;
        $shop->carrier_installed_on = Carbon::now();
    }

    public function requestPermissions(Request $request)
    {
        if ($this->validateShop($request)) {
            //disable existing installation
            DB::table('shops')->where([
                'shop' => Input::get('shop'),
                'app_installed' => 1,
            ])->update([
                'app_installed' => 2,
            ]);

            $shop = new Shop();

            $shop->shop = Input::get('shop');
            $user = Auth::user();
            $shop->user_id = $user['id'];
            $shop->nonce = sha1(str_random(64));

            if ($shop->save()) {
                return $this->redirectToShopAdmin($shop);
            }
        }

        $request->session()->flash('shop_error', 'Invalid shop url');

        $queryString = !Input::get('shop') ? '' : '?shop='.urlencode(Input::get('shop'));

        return redirect('/'.$queryString);
    }

    private function validateShop(Request $request)
    {
        $shop = $request->input('shop');
        $server = config('shopify.domain');

        return preg_match("|[a-z0-9\-]{3,100}\.${server}|", $shop) === 1;
    }

    private function redirectToShopAdmin(Shop $shop)
    {
        $client = new ShopifyClient($shop->shop, null, config('shopify.api_key'), config('shopify.secret'));
        $installUrl = $client->getAuthorizeUrl(config('shopify.scopes'), config('shopify.redirect_uri'));
        $installUrl .= '&state='.urlencode($shop->nonce);

        return redirect($installUrl);
    }
}
