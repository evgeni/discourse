# frozen_string_literal: true

require "addressable"

module Onebox
  module Helpers

    class DownloadTooLarge < StandardError; end

    IGNORE_CANONICAL_DOMAINS ||= ['www.instagram.com']

    def self.symbolize_keys(hash)
      return {} if hash.nil?

      hash.inject({}) do |result, (key, value)|
        new_key = key.is_a?(String) ? key.to_sym : key
        new_value = value.is_a?(Hash) ? symbolize_keys(value) : value
        result[new_key] = new_value
        result
      end
    end

    def self.clean(html)
      html.gsub(/<[^>]+>/, ' ').gsub(/\n/, '')
    end

    def self.fetch_html_doc(url, headers = nil)
      response = (fetch_response(url, nil, nil, headers) rescue nil)
      doc = Nokogiri::HTML(response)
      uri = URI(url)

      ignore_canonical_tag = doc.at('meta[property="og:ignore_canonical"]')
      should_ignore_canonical = IGNORE_CANONICAL_DOMAINS.map { |hostname| uri.hostname.match?(hostname) }.any?

      unless (ignore_canonical_tag && ignore_canonical_tag['content'].to_s == 'true') || should_ignore_canonical
        # prefer canonical link
        canonical_link = doc.at('//link[@rel="canonical"]/@href')
        canonical_uri = URI(canonical_link)
        if canonical_link && "#{canonical_uri.host}#{canonical_uri.path}" != "#{uri.host}#{uri.path}"
          response = (fetch_response(canonical_link, nil, nil, headers) rescue nil)
          doc = Nokogiri::HTML(response) if response
        end
      end

      doc
    end

    def self.fetch_response(location, limit = nil, domain = nil, headers = nil)

      limit ||= 5
      limit = Onebox.options.redirect_limit if limit > Onebox.options.redirect_limit

      raise Net::HTTPError.new('HTTP redirect too deep', location) if limit == 0

      uri = URI(location)
      uri = URI("#{domain}#{location}") if !uri.host

      result = StringIO.new
      Net::HTTP.start(uri.host, uri.port, use_ssl: uri.is_a?(URI::HTTPS)) do |http|
        http.open_timeout = Onebox.options.connect_timeout
        http.read_timeout = Onebox.options.timeout
        if uri.is_a?(URI::HTTPS)
          http.use_ssl = true
          http.verify_mode = OpenSSL::SSL::VERIFY_NONE
        end

        headers ||= {}

        if Onebox.options.user_agent && !headers['User-Agent']
          headers['User-Agent'] = Onebox.options.user_agent
        end

        request = Net::HTTP::Get.new(uri.request_uri, headers)
        start_time = Time.now

        size_bytes = Onebox.options.max_download_kb * 1024
        http.request(request) do |response|

          if cookie = response.get_fields('set-cookie')
            header = { 'Cookie' => cookie.join }
          end

          header = nil unless header.is_a? Hash

          code = response.code.to_i
          unless code === 200
            response.error! unless [301, 302].include?(code)
            return fetch_response(
              response['location'],
              limit - 1,
              "#{uri.scheme}://#{uri.host}",
              header
            )
          end

          response.read_body do |chunk|
            result.write(chunk)
            raise DownloadTooLarge.new if result.size > size_bytes
            raise Timeout::Error.new if (Time.now - start_time) > Onebox.options.timeout
          end

          return result.string
        end
      end
    end

    def self.fetch_content_length(location)
      uri = URI(location)

      Net::HTTP.start(uri.host, uri.port, use_ssl: uri.is_a?(URI::HTTPS)) do |http|
        http.open_timeout = Onebox.options.connect_timeout
        http.read_timeout = Onebox.options.timeout
        if uri.is_a?(URI::HTTPS)
          http.use_ssl = true
          http.verify_mode = OpenSSL::SSL::VERIFY_NONE
        end

        http.request_head([uri.path, uri.query].join("?")) do |response|
          code = response.code.to_i
          unless code === 200 || Onebox::Helpers.blank?(response.header['content-length'])
            return nil
          end
          return response.header['content-length']
        end
      end
    end

    def self.pretty_filesize(size)
      conv = [ 'B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB' ]
      scale = 1024

      ndx = 1
      if (size < 2 * (scale**ndx)) then
        return "#{(size)} #{conv[ndx - 1]}"
      end
      size = size.to_f
      [2, 3, 4, 5, 6, 7].each do |i|
        if (size < 2 * (scale**i)) then
          return "#{'%.2f' % (size / (scale**(i - 1)))} #{conv[i - 1]}"
        end
      end
      ndx = 7
      "#{'%.2f' % (size / (scale**(ndx - 1)))} #{conv[ndx - 1]}"
    end

    def self.click_to_scroll_div(width = 690, height = 400)
      "<div style=\"background:transparent;position:relative;width:#{width}px;height:#{height}px;top:#{height}px;margin-top:-#{height}px;\" onClick=\"style.pointerEvents='none'\"></div>"
    end

    def self.blank?(value)
      if value.nil?
        true
      elsif String === value
        value.empty? || !(/[[:^space:]]/ === value)
      else
        value.respond_to?(:empty?) ? !!value.empty? : !value
      end
    end

    def self.truncate(string, length = 50)
      string.size > length ? string[0...(string.rindex(" ", length) || length)] + "..." : string
    end

    def self.get(meta, attr)
      (meta && !blank?(meta[attr])) ? sanitize(meta[attr]) : nil
    end

    def self.sanitize(value, length = 50)
      return nil if blank?(value)
      Sanitize.fragment(value).strip
    end

    def self.normalize_url_for_output(url)
      return "" unless url
      url = url.dup
      # expect properly encoded url, remove any unsafe chars
      url.gsub!(' ', '%20')
      url.gsub!("'", "&apos;")
      url.gsub!('"', "&quot;")
      url.gsub!(/[^\w\-`.~:\/?#\[\]@!$&'\(\)*+,;=%\p{M}’]/, "")
      url
    end

    def self.get_absolute_image_url(src, url)
      if src && !!(src =~ /^\/\//)
        uri = URI(url)
        src = "#{uri.scheme}:#{src}"
      elsif src && src.match(/^https?:\/\//i).nil?
        uri = URI(url)
        src = if !src.start_with?("/") && uri.path.present?
          "#{uri.scheme}://#{uri.host.sub(/\/$/, '')}#{uri.path.sub(/\/$/, '')}/#{src.sub(/^\//, '')}"
        else
          "#{uri.scheme}://#{uri.host.sub(/\/$/, '')}/#{src.sub(/^\//, '')}"
        end
      end
      src
    end

    # Percent-encodes a URI string per RFC3986 - https://tools.ietf.org/html/rfc3986
    def self.uri_encode(url)
      return "" unless url

      uri = Addressable::URI.parse(url)

      encoded_uri = Addressable::URI.new(
        scheme: Addressable::URI.encode_component(uri.scheme, Addressable::URI::CharacterClasses::SCHEME),
        authority: Addressable::URI.encode_component(uri.authority, Addressable::URI::CharacterClasses::AUTHORITY),
        path: Addressable::URI.encode_component(uri.path, Addressable::URI::CharacterClasses::PATH + "\\%"),
        query: Addressable::URI.encode_component(uri.query, "a-zA-Z0-9\\-\\.\\_\\~\\$\\&\\*\\,\\=\\:\\@\\?\\%"),
        fragment: Addressable::URI.encode_component(uri.fragment, "a-zA-Z0-9\\-\\.\\_\\~\\!\\$\\&\\'\\(\\)\\*\\+\\,\\;\\=\\:\\/\\?\\%")
      )

      encoded_uri.to_s
    end

    def self.uri_unencode(url)
      Addressable::URI.unencode(url)
    end

    def self.video_placeholder_html
      "<div class='onebox-placeholder-container'><span class='placeholder-icon video'></span></div>"
    end

    def self.audio_placeholder_html
      "<div class='onebox-placeholder-container'><span class='placeholder-icon audio'></span></div>"
    end

    def self.generic_placeholder_html
      "<div class='onebox-placeholder-container'><span class='placeholder-icon generic'></span></div>"
    end
  end
end
