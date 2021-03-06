(function () {
  "'use strict';"
  var HOST = '/apps/collivery';

  //finds next item in form
  var findNext = function (parent, childSelector) {
    return parent.closest('form').find(childSelector).first();
  };

  var main = function ($) {

    function RequestCounter() {
      var count = 0;
      return {
        get: function () {
          return count;
        },
        increment: function () {
          count++;
        },
        decrement: function () {
          count--;
        },
        reset: function () {
          count = 0;
        }
      }
    }

    var removeStatusText = function () {
      $('body .server-status').fadeOut('slow');
    };

    var statusIndicator = function (error, done) {
      if (done && !error) {
        removeStatusText();
        return;
      }

      var statusBox = $('<div/>')
        .css({
          position: 'fixed',
          top: 0,
          left: 0,
          width: $(window).width(),
          height: 'auto',
          "text-align": 'center',
          background: 'rgb(245, 195, 75) none repeat scroll 0% 0%',
          "z-index": 9999999,
        });

      $(window).resize(function () {
        statusBox.css({
          width: $(window).width()
        });
      });

      statusBox.addClass('server-status');

      var statusLink = $('<a/>')
        .attr('href', error ? window.location.href : 'javascript:void(0)');

      statusLink.text(error ? 'Network error. Reload page' : 'Loading...');

      if (!error) {
        statusLink.css('color', 'grey');
      }

      statusBox.append(statusLink);
      statusBox.append(statusLink)

      $('body').prepend(statusBox);
    };

    var requestCounter = new RequestCounter();
    var hasError = false;

    $(document).on('ajaxSend', function (e, xhr) {

      $('input:not(:submit),select').attr('disabled', 'disabled');

      statusIndicator(hasError, false);
      requestCounter.increment();

    }).on('ajaxSuccess', function (e, xhr) {

    }).on('ajaxError', function () {
      hasError = true;

    }).on('ajaxComplete', function (e, xhr) {
      removeStatusText();
      statusIndicator(hasError, true);
      requestCounter.decrement();

      if (requestCounter.get() === 0 && !hasError) {
        $('input:not(:submit),select').removeAttr('disabled');
      }
    });

    var dropdown = function (params) {

      if (!params) {
        throw new Error('Invalid arguments');
      }

      var dropdown = $('<select/>');

      dropdown.attr('name', params.name);
      dropdown.attr('id', params.id);

      //data to be attached to the element
      $.each(params.extras, function (k, v) {
        dropdown.data(k, params.extras[k]);
      });

      $.each(params.data, function (k, v) {
        var option = $('<option/>');
        option.attr('value', k);
        option.text(v);

        if (k == params.currentVal)
          option.attr('selected', 'selected');

        dropdown.append(option);
      });

      return $(dropdown);
    };

    var provinceFields = $('[name="address[province]"]');

    var defaultProvince = $('<option value="-1">Select province</option>');
    provinceFields.prepend(defaultProvince);
    provinceFields.val('-1');
    provinceFields.show();


    var getProvinces = function (success, fail) {
      var provinces = [];

      provinceFields.first().find('option').each(function () {
        provinces.push($(this).val());
      });


      $.ajax({
        url: HOST + '/script/towns',
        dataType: 'json',
        method: 'GET',
        data: {
          provinces: provinces.join()
        },
        crossDomain: true,
        success: success
      });
    };

    var getSuburbs = function (townId, success, error) {
      $.ajax({
        url: HOST + '/script/' + townId + '/suburbs',
        dataType: 'json',
        method: 'GET',
        success: success
      });
    };


    var getLocationTypes = function (success, error) {
      $.ajax({
        url: HOST + '/scripts/location-types',
        method: 'GET',
        dataType: 'json',
        success: success,
        error: error,
      });
    };


    var cityFields = $('[name="address[city]"]');
    // var cityField = $( 'address[city]' );

    var populateTowns = function (cityField, towns) {
      cityField = $(cityField);
      var newCityField = dropdown({
        data: towns,
        name: cityField.attr('name'),
        id: cityField.attr('id'),
        currentVal: '-1'
      });

      cityField.replaceWith(newCityField);

      newCityField.on('change', function (e) {
        var newCityField = $(this);
        var form = $(newCityField.parents('form').get(0));
        var suburbsField = $(form.find('[name="address[address2]"]').get(0));
        var populateSuburbs = function (suburbs) {
          suburbs[-1] = 'Select suburb';

          var newSuburbsField = dropdown({
            data: suburbs,
            name: suburbsField.attr('name'),
            id: suburbsField.attr('id'),
            currentVal: -1,
            extras: {
              suburbs: suburbs
            }
          });

          suburbsField.replaceWith(newSuburbsField);
        }

        if (newCityField.val() == '-1') {
          populateSuburbs({});
          return;
        }

        getSuburbs(newCityField.val(), populateSuburbs, function (suburbs) {
        });
      });
      newCityField.change();
    };

    var addAddress = $('a[name="Shopify.CustomerAddress.toggleNewForm(); return false;"]');
    addAddress.click();

    var country = $('select[name="address[country]"]');
    country.val('South Africa');
    country.change();


    getProvinces(function (towns) {
      var towns = towns;

      towns['-1'] = {
        '-1': 'Select town'
      };

      provinceFields.each(function () {
        var provinceField = $(this);

        if (provinceField.val() in towns) {

          var townField = findNext(provinceField, '[name="address[city]"]');
          var provinceTowns = towns[provinceField.val()];

          provinceField.data('towns', provinceTowns);
          provinceField.find('option').each(function () {
            var provinceOption = $(this);
            provinceOption.data('towns', towns[provinceOption.val()]);
          });

          provinceField.on('change', function () {
            var currentTowns = $(this).find('option:selected').data('towns');
            currentTowns['-1'] = 'Select town';
            populateTowns(findNext($(this), '[name="address[city]"]'), currentTowns);
          });

          provinceField.change();
        }
      });
    });

    //rename address 2s
    $('label[for^="AddressAddress2"]').text('Suburb');
    var locationTypeFields = $('[name="address[location_type]"');

    //disable countries except ZA
    $('select[name="address[country]"]  option[value!="South Africa"]').attr('disabled', 'disabled');


    $('form').each(function () {
      var form = $(this);
      var submitButton = form.find(':submit').first();
      submitButton.attr('disabled', 'disabled');
      var inputs = ':text,:password,select,input[type="tel"]';

      form.find(inputs).on('focus click change blur keyup', function () {
        var submit = true;
        form.find(inputs).each(function () {
          var input = $(this);

          if (!input.val().match(/.{2,}/)) {
            submit = false;
            $(this).addClass('error');
          } else {
            $(this).removeClass('error');
          }
        });

        if (!submit) {
          submitButton.attr('disabled', 'disabled');
        } else {
          submitButton.removeAttr('disabled');
        }
      });
    });


  };

  var callback = function () {
    jQuery3 = jQuery.noConflict(true);
    main(jQuery3);
  };

  //load for addresses page only
  if (window.location.href.indexOf('/addresses') !== -1)
    if (typeof jQuery == 'undefined' || parseFloat(jQuery.fn.jquery) < 1.9) {
      var script = document.createElement('script');
      script.type = 'text/javascript';

      if (script.readyState) {
        script.onreadystatechange = function () {
          if (script.readyState == 'loaded' || script.readyState == 'complete') {
            script.onreadystatechange = null;
            callback();
          }
        };
      }
      else {
        script.onload = function () {
          script.onload = null;
          callback();
        };
      }

      script.src = 'https://ajax.googleapis.com/ajax/libs/jquery/3.1.0/jquery.min.js';
      document.getElementsByTagName('head')[0].appendChild(script);

    }
    else {
      main(jQuery);
    }
})();
