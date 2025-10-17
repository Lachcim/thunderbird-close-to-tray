.PHONY: clean

FILES := $(shell find src -type f)

close-to-tray.xpi: $(FILES) LICENSE
	cd src; zip ../close-to-tray.xpi $(FILES:src/%=%)
	zip close-to-tray.xpi LICENSE

clean:
	rm close-to-tray.xpi
